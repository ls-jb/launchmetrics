"""
Agregações e filtros do dashboard de vendas + cadastro manual.

REGRAS DE NEGÓCIO (alinhadas com o usuário):
- Cada linha = uma compra do cliente.
- Recorrências: só a PRIMEIRA cobrança (recorrencia_seq = 1) conta; seq>1 fica
  gravado mas não entra no dashboard.
- Só status='aprovada' entra nos cálculos.
- OVERRIDE DE VALOR: se a oferta tem um valor cadastrado em ofertas_precos,
  usamos ele no lugar do valor da transação (ex: boleto parcelado, onde o
  webhook só manda a parcela, não o valor à vista).
- DEDUP DE SPLIT: o mesmo email comprando a mesma oferta (oferta_codigo) conta
  uma vez só — cobre pagamento em 2 cartões / 2 transações da mesma compra.
  Como offer codes são específicos por lançamento, isso não funde recompras
  de campanhas diferentes.
"""
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

BR_TZ = ZoneInfo("America/Sao_Paulo")
"""Fuso usado nos filtros de data do dashboard/LP — usuários (e Hotmart/Guru)
pensam o dia em horário de Brasília."""

from sqlalchemy import (
    Date,
    String,
    and_,
    case,
    cast,
    func,
    or_,
    select,
)
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import BackgroundTasks

from app.models import OfertaPreco, Venda
from app.schemas.venda import (
    OfertaBreakdown,
    OfertaPrecoUpsert,
    PontoReceita,
    ProdutoRanking,
    ResumoVendas,
    VendaManualCreate,
)
from app.services import sheets_export_service

ZERO = Decimal("0")
STATUS_FATURADO = "aprovada"


# ============================================================
# Subquery base do dashboard (override de preço + dedup)
# ============================================================
def _vendas_efetivas(
    inicio: date, fim: date, produtos: list[str] | None, oferta: str | None
):
    """
    Monta a subquery de vendas "efetivas" do dashboard:
    - filtra status aprovada, período, recorrência seq<=1, produtos/oferta
    - valor_efetivo = override de ofertas_precos OU valor da venda
    - dedup: mantém 1 linha por (email, oferta_codigo) quando ambos não nulos

    Retorna uma subquery com colunas: produto, oferta_nome, oferta_codigo,
    valor_efetivo, data_venda.

    `produtos` aceita uma lista (multi-seleção). Vazio/None = todos.
    """
    inicio_dt, fim_dt = _range_utc(inicio, fim)

    valor_efetivo = func.coalesce(OfertaPreco.valor, Venda.valor).label("valor_efetivo")

    # Chave de dedup: email|oferta quando ambos existem; senão, o id da venda
    # (cada linha vira seu próprio grupo → nunca é deduplicada).
    dedup_key = case(
        (
            and_(Venda.comprador_email.is_not(None), Venda.oferta_codigo.is_not(None)),
            Venda.comprador_email + cast(Venda.oferta_codigo, String),
        ),
        else_=cast(Venda.id, String),
    )
    rn = (
        func.row_number()
        .over(partition_by=dedup_key, order_by=Venda.data_venda)
        .label("rn")
    )

    base = (
        select(
            Venda.produto.label("produto"),
            Venda.oferta_nome.label("oferta_nome"),
            Venda.oferta_codigo.label("oferta_codigo"),
            valor_efetivo,
            Venda.data_venda.label("data_venda"),
            rn,
        )
        .select_from(Venda)
        .outerjoin(OfertaPreco, OfertaPreco.oferta_codigo == Venda.oferta_codigo)
        .where(
            Venda.data_venda >= inicio_dt,
            Venda.data_venda < fim_dt,
            Venda.status == STATUS_FATURADO,
            or_(Venda.recorrencia_seq.is_(None), Venda.recorrencia_seq == 1),
        )
    )
    if produtos:
        base = base.where(Venda.produto.in_(produtos))
    if oferta:
        base = base.where(Venda.oferta == oferta)

    base_sub = base.subquery()
    # mantém só a primeira de cada grupo de dedup
    return select(base_sub).where(base_sub.c.rn == 1).subquery()


# ============================================================
# Leitura — agregações do dashboard
# ============================================================
async def resumo(
    db: AsyncSession,
    inicio: date,
    fim: date,
    produtos: list[str] | None,
    oferta: str | None,
) -> ResumoVendas:
    sub = _vendas_efetivas(inicio, fim, produtos, oferta)
    stmt = select(
        func.coalesce(func.sum(sub.c.valor_efetivo), 0).label("receita_total"),
        func.count().label("quantidade"),
    ).select_from(sub)
    row = (await db.execute(stmt)).one()
    receita = Decimal(row.receita_total)
    qtd = int(row.quantidade)
    ticket = (receita / qtd) if qtd > 0 else ZERO
    return ResumoVendas(receita_total=receita, quantidade=qtd, ticket_medio=ticket)


async def por_dia(
    db: AsyncSession,
    inicio: date,
    fim: date,
    produtos: list[str] | None,
    oferta: str | None,
) -> list[PontoReceita]:
    sub = _vendas_efetivas(inicio, fim, produtos, oferta)
    dia = cast(sub.c.data_venda, Date).label("dia")
    stmt = (
        select(
            dia,
            func.sum(sub.c.valor_efetivo).label("receita"),
            func.count().label("quantidade"),
        )
        .select_from(sub)
        .group_by(dia)
        .order_by(dia)
    )
    rows = (await db.execute(stmt)).all()
    return [
        PontoReceita(data=r.dia, receita=r.receita, quantidade=r.quantidade)
        for r in rows
    ]


async def por_produto(
    db: AsyncSession,
    inicio: date,
    fim: date,
    produtos: list[str] | None,
    oferta: str | None,
) -> list[ProdutoRanking]:
    sub = _vendas_efetivas(inicio, fim, produtos, oferta)
    stmt = (
        select(
            sub.c.produto.label("produto"),
            func.count().label("quantidade"),
            func.sum(sub.c.valor_efetivo).label("receita"),
        )
        .select_from(sub)
        .group_by(sub.c.produto)
        .order_by(func.sum(sub.c.valor_efetivo).desc())
    )
    rows = (await db.execute(stmt)).all()
    return [
        ProdutoRanking(produto=r.produto, quantidade=r.quantidade, receita=r.receita)
        for r in rows
    ]


async def ofertas_por_produto(
    db: AsyncSession, produto: str, inicio: date, fim: date
) -> list[OfertaBreakdown]:
    """Detalhe das ofertas de UM produto (popup do ranking)."""
    sub = _vendas_efetivas(inicio, fim, [produto], None)
    stmt = (
        select(
            sub.c.oferta_nome,
            sub.c.oferta_codigo,
            func.max(sub.c.valor_efetivo).label("valor_oferta"),
            func.count().label("quantidade"),
            func.sum(sub.c.valor_efetivo).label("receita"),
        )
        .select_from(sub)
        .group_by(sub.c.oferta_nome, sub.c.oferta_codigo)
        .order_by(func.sum(sub.c.valor_efetivo).desc())
    )
    rows = (await db.execute(stmt)).all()

    # Anexa o valor de override cadastrado (se houver) pra cada oferta,
    # pra UI mostrar/editar o valor registrado.
    codigos = [r.oferta_codigo for r in rows if r.oferta_codigo]
    overrides: dict[str, Decimal] = {}
    if codigos:
        ov = (
            await db.execute(
                select(OfertaPreco.oferta_codigo, OfertaPreco.valor).where(
                    OfertaPreco.oferta_codigo.in_(codigos)
                )
            )
        ).all()
        overrides = {codigo: valor for codigo, valor in ov}

    return [
        OfertaBreakdown(
            oferta_nome=r.oferta_nome,
            oferta_codigo=r.oferta_codigo,
            valor_oferta=r.valor_oferta,
            quantidade=r.quantidade,
            receita=r.receita,
            valor_override=overrides.get(r.oferta_codigo) if r.oferta_codigo else None,
        )
        for r in rows
    ]


async def listar(
    db: AsyncSession,
    inicio: date,
    fim: date,
    produtos: list[str] | None,
    oferta: str | None,
    limit: int,
    offset: int,
) -> list[Venda]:
    """Listagem detalhada (auditoria). Mostra TODAS as vendas do período,
    inclusive recorrências seq>1 e duplicatas — sem dedup, sem override."""
    inicio_dt, fim_dt = _range_utc(inicio, fim)
    stmt = select(Venda).order_by(Venda.data_venda.desc())
    stmt = stmt.where(
        Venda.data_venda >= inicio_dt,
        Venda.data_venda < fim_dt,
        Venda.status == STATUS_FATURADO,
    )
    if produtos:
        stmt = stmt.where(Venda.produto.in_(produtos))
    if oferta:
        stmt = stmt.where(Venda.oferta == oferta)
    stmt = stmt.offset(offset).limit(limit)
    return list((await db.execute(stmt)).scalars().all())


async def produtos_distintos(db: AsyncSession) -> list[str]:
    """Lista de produtos únicos com vendas aprovadas — alimenta o dropdown."""
    stmt = (
        select(Venda.produto)
        .where(Venda.status == STATUS_FATURADO)
        .distinct()
        .order_by(Venda.produto)
    )
    return [row[0] for row in (await db.execute(stmt)).all()]


# ============================================================
# Escrita
# ============================================================
async def criar_manual(
    db: AsyncSession,
    dados: VendaManualCreate,
    *,
    background_tasks: BackgroundTasks | None = None,
) -> Venda:
    """Cria N vendas manuais (PIX direto, venda avulsa). quantidade>1 vira
    N linhas idênticas (lote). Retorna a última criada. Quando
    `background_tasks` vem, o export pra planilha é enfileirado e não
    bloqueia o response."""
    criadas: list[Venda] = []
    for _ in range(dados.quantidade):
        venda = Venda(
            plataforma="Manual",
            external_id=None,
            produto=dados.produto,
            oferta=dados.oferta,
            oferta_nome=dados.oferta_nome,
            oferta_codigo=dados.oferta_codigo,
            tipo=dados.tipo,
            recorrencia_seq=dados.recorrencia_seq,
            assinatura_id=dados.assinatura_id,
            metodo_pagamento=dados.metodo_pagamento,
            valor=dados.valor,
            status="aprovada",
            comprador_nome=dados.comprador_nome,
            comprador_email=dados.comprador_email,
            data_venda=dados.data_venda,
            payload_bruto=None,
        )
        db.add(venda)
        criadas.append(venda)
    await db.commit()
    assert criadas
    for v in criadas:
        await db.refresh(v)
        if background_tasks is not None:
            background_tasks.add_task(sheets_export_service.exportar, v)
        else:
            await sheets_export_service.exportar(v)
    return criadas[-1]


async def remover(db: AsyncSession, venda_id) -> bool:
    """Remove uma venda por id. Retorna True se removeu, False se não existia."""
    venda = await db.get(Venda, venda_id)
    if not venda:
        return False
    await db.delete(venda)
    await db.commit()
    return True


async def upsert_preco_oferta(db: AsyncSession, dados: OfertaPrecoUpsert) -> OfertaPreco:
    """Cadastra ou atualiza o valor à vista de uma oferta."""
    preco = await db.get(OfertaPreco, dados.oferta_codigo)
    if preco:
        preco.valor = dados.valor
        if dados.oferta_nome:
            preco.oferta_nome = dados.oferta_nome
        preco.atualizado_em = datetime.now(timezone.utc)
    else:
        preco = OfertaPreco(
            oferta_codigo=dados.oferta_codigo,
            oferta_nome=dados.oferta_nome,
            valor=dados.valor,
        )
        db.add(preco)
    await db.commit()
    await db.refresh(preco)
    return preco


async def remover_preco_oferta(db: AsyncSession, oferta_codigo: str) -> bool:
    """Remove o override — a oferta volta a usar o valor da transação."""
    preco = await db.get(OfertaPreco, oferta_codigo)
    if not preco:
        return False
    await db.delete(preco)
    await db.commit()
    return True


# ============================================================
# Helpers
# ============================================================
def _range_utc(inicio: date, fim: date) -> tuple[datetime, datetime]:
    """Converte YYYY-MM-DD em range [inicio_00_BRT, fim+1_00_BRT) e devolve em
    UTC. O usuário pensa em dias no fuso de Brasília (UTC-3); usar UTC puro
    fazia vendas de 21h-23h59 BRT do dia anterior caírem no "dia seguinte"
    porque viram 00h-03h UTC."""
    inicio_dt = datetime.combine(inicio, time.min, tzinfo=BR_TZ).astimezone(timezone.utc)
    fim_dt = datetime.combine(
        fim + timedelta(days=1), time.min, tzinfo=BR_TZ
    ).astimezone(timezone.utc)
    return inicio_dt, fim_dt
