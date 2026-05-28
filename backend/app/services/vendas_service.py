"""
Agregações e filtros do dashboard de vendas + cadastro manual.

REGRAS DE NEGÓCIO IMPORTANTES (alinhadas com o usuário):
- Cada linha da tabela = uma compra do cliente (não uma transação).
- Vendas de recorrência são gravadas todas (auditoria), mas no dashboard
  só conta a PRIMEIRA cobrança (recorrencia_seq = 1).
- Vendas únicas (tipo='unica') têm recorrencia_seq NULL e sempre contam.
- Só vendas com status='aprovada' entram nos cálculos de receita.
"""
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import Date, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from app.models import Venda
from app.schemas.venda import (
    OfertaBreakdown,
    PontoReceita,
    ProdutoRanking,
    ResumoVendas,
    VendaManualCreate,
)

ZERO = Decimal("0")
STATUS_FATURADO = "aprovada"


# ============================================================
# Operações públicas — leitura
# ============================================================
async def listar(
    db: AsyncSession,
    inicio: date,
    fim: date,
    produto: str | None,
    oferta: str | None,
    limit: int,
    offset: int,
) -> list[Venda]:
    """
    Listagem detalhada (vai para a tabela de vendas). Inclui TODAS as vendas
    no período (inclusive recorrências seq>1) para fins de auditoria.
    """
    stmt = select(Venda).order_by(Venda.data_venda.desc())
    stmt = _filtros_basicos(stmt, inicio, fim, produto, oferta)
    stmt = stmt.offset(offset).limit(limit)
    return list((await db.execute(stmt)).scalars().all())


async def resumo(
    db: AsyncSession,
    inicio: date,
    fim: date,
    produto: str | None,
    oferta: str | None,
) -> ResumoVendas:
    stmt = select(
        func.coalesce(func.sum(Venda.valor), 0).label("receita_total"),
        func.count(Venda.id).label("quantidade"),
    )
    stmt = _filtros_dashboard(stmt, inicio, fim, produto, oferta)
    row = (await db.execute(stmt)).one()
    receita = Decimal(row.receita_total)
    qtd = int(row.quantidade)
    ticket = (receita / qtd) if qtd > 0 else ZERO
    return ResumoVendas(receita_total=receita, quantidade=qtd, ticket_medio=ticket)


async def por_dia(
    db: AsyncSession,
    inicio: date,
    fim: date,
    produto: str | None,
    oferta: str | None,
) -> list[PontoReceita]:
    dia = cast(Venda.data_venda, Date).label("dia")
    stmt = (
        select(dia, func.sum(Venda.valor).label("receita"))
        .group_by(dia)
        .order_by(dia)
    )
    stmt = _filtros_dashboard(stmt, inicio, fim, produto, oferta)
    rows = (await db.execute(stmt)).all()
    return [PontoReceita(data=r.dia, receita=r.receita) for r in rows]


async def por_produto(
    db: AsyncSession,
    inicio: date,
    fim: date,
    produto: str | None,
    oferta: str | None,
) -> list[ProdutoRanking]:
    stmt = (
        select(
            Venda.produto.label("produto"),
            func.count(Venda.id).label("quantidade"),
            func.sum(Venda.valor).label("receita"),
        )
        .group_by(Venda.produto)
        .order_by(func.sum(Venda.valor).desc())
    )
    stmt = _filtros_dashboard(stmt, inicio, fim, produto, oferta)
    rows = (await db.execute(stmt)).all()
    return [
        ProdutoRanking(produto=r.produto, quantidade=r.quantidade, receita=r.receita)
        for r in rows
    ]


async def ofertas_por_produto(
    db: AsyncSession,
    produto: str,
    inicio: date,
    fim: date,
) -> list[OfertaBreakdown]:
    """
    Detalhe das ofertas de UM produto, pro popup do ranking.
    Agrupa por (oferta_nome, oferta_codigo). Aplica a mesma regra do
    dashboard (status aprovada + recorrência seq<=1 + período).
    valor_oferta = maior valor observado (preço cheio, sem desconto/juros).
    """
    stmt = (
        select(
            Venda.oferta_nome,
            Venda.oferta_codigo,
            func.max(Venda.valor).label("valor_oferta"),
            func.count(Venda.id).label("quantidade"),
            func.sum(Venda.valor).label("receita"),
        )
        .group_by(Venda.oferta_nome, Venda.oferta_codigo)
        .order_by(func.sum(Venda.valor).desc())
    )
    stmt = _filtros_dashboard(stmt, inicio, fim, produto, None)
    rows = (await db.execute(stmt)).all()
    return [
        OfertaBreakdown(
            oferta_nome=r.oferta_nome,
            oferta_codigo=r.oferta_codigo,
            valor_oferta=r.valor_oferta,
            quantidade=r.quantidade,
            receita=r.receita,
        )
        for r in rows
    ]


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
# Operações públicas — escrita
# ============================================================
async def criar_manual(db: AsyncSession, dados: VendaManualCreate) -> Venda:
    """Cria uma venda manual (PIX direto, venda avulsa)."""
    venda = Venda(
        plataforma="Manual",
        external_id=None,
        produto=dados.produto,
        oferta=dados.oferta,
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
    await db.commit()
    await db.refresh(venda)
    return venda


# ============================================================
# Helpers privados
# ============================================================
def _range_utc(inicio: date, fim: date) -> tuple[datetime, datetime]:
    """Converte YYYY-MM-DD em range [inicio_00, fim+1_00) UTC."""
    inicio_dt = datetime.combine(inicio, time.min, tzinfo=timezone.utc)
    fim_dt = datetime.combine(fim + timedelta(days=1), time.min, tzinfo=timezone.utc)
    return inicio_dt, fim_dt


def _filtros_basicos(
    stmt: Select,
    inicio: date,
    fim: date,
    produto: str | None,
    oferta: str | None,
) -> Select:
    """Filtros comuns: período + status aprovada + produto + oferta opcionais."""
    inicio_dt, fim_dt = _range_utc(inicio, fim)
    stmt = stmt.where(
        Venda.data_venda >= inicio_dt,
        Venda.data_venda < fim_dt,
        Venda.status == STATUS_FATURADO,
    )
    if produto:
        stmt = stmt.where(Venda.produto == produto)
    if oferta:
        stmt = stmt.where(Venda.oferta == oferta)
    return stmt


def _filtros_dashboard(
    stmt: Select,
    inicio: date,
    fim: date,
    produto: str | None,
    oferta: str | None,
) -> Select:
    """
    Filtros do DASHBOARD: aplica os básicos e adicionalmente exclui cobranças
    recorrentes seq > 1 (só a primeira cobrança de cada assinatura conta).
    """
    stmt = _filtros_basicos(stmt, inicio, fim, produto, oferta)
    stmt = stmt.where(
        or_(Venda.recorrencia_seq.is_(None), Venda.recorrencia_seq == 1)
    )
    return stmt
