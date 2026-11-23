"""
Dashboard de vendas dos lançamentos (lancamentos.tipo == 'vendas').

O lançamento guarda só o VÍNCULO com ofertas e produtos (lancamentos_ofertas);
as vendas continuam na tabela `vendas`. Conta como venda do lançamento:

- toda venda de uma oferta vinculada (oferta_codigo), OU
- toda venda de um produto vinculado por inteiro (qualquer oferta dele,
  inclusive as criadas depois e as vendas sem código de oferta);
- dentro do período [data_inicio, data_fim] do lançamento, em horário de
  Brasília. Data em branco = sem limite daquele lado.

A regra de "venda real" é a MESMA do dashboard de vendas e dos perpétuos:
status aprovada, só a 1ª cobrança da recorrência, valor com override de
ofertas_precos e dedup por email + oferta (considerando todo o histórico).
"""
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Iterable, Protocol
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import Date, String, and_, case, cast, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql.selectable import Subquery

from app.models import Lancamento, LancamentoOferta, OfertaPreco, Venda
from app.schemas.lancamento import LancamentoResponse
from app.schemas.lancamento_vendas import (
    LancamentoVendasPainel,
    OfertaVendida,
    PontoVendaDia,
    ProdutoVendido,
    VinculoOferta,
    VinculoOfertaResponse,
)

BR_TZ = ZoneInfo("America/Sao_Paulo")
FUSO_BR = "America/Sao_Paulo"
ZERO = Decimal("0")


class _Vinculo(Protocol):
    """O mínimo que as funções daqui precisam de um vínculo — serve tanto
    pro model (LancamentoOferta) quanto pro schema (VinculoOferta)."""

    produto: str | None
    oferta_codigo: str | None
    oferta_nome: str | None


@dataclass(frozen=True)
class TotaisVendas:
    """Total de vendas reais de um lançamento no período dele."""

    quantidade: int = 0
    receita: Decimal = ZERO


# ============================================================
# Regras puras (sem banco) — cobertas por teste
# ============================================================
def separar_vinculos(vinculos: Iterable[_Vinculo]) -> tuple[list[str], list[str]]:
    """Devolve (códigos de oferta, produtos inteiros) sem repetição."""
    codigos = {v.oferta_codigo for v in vinculos if v.oferta_codigo}
    produtos = {v.produto for v in vinculos if not v.oferta_codigo and v.produto}
    return sorted(codigos), sorted(produtos)


def deduplicar_itens(itens: Iterable[VinculoOferta]) -> list[VinculoOferta]:
    """Tira itens repetidos da seleção. Oferta avulsa de um produto que já
    foi marcado por inteiro é descartada — o produto já cobre ela."""
    lista = list(itens)
    produtos_inteiros = {i.produto for i in lista if not i.oferta_codigo}
    vistos: set[tuple[str, str]] = set()
    unicos: list[VinculoOferta] = []
    for item in lista:
        if item.oferta_codigo and item.produto in produtos_inteiros:
            continue
        chave = ("oferta", item.oferta_codigo) if item.oferta_codigo else ("produto", item.produto or "")
        if chave in vistos:
            continue
        vistos.add(chave)
        unicos.append(item)
    return unicos


def completar_com_vinculos(
    vendidas: list[OfertaVendida], vinculos: Iterable[_Vinculo]
) -> list[OfertaVendida]:
    """Junta o que vendeu com o que está selecionado mas ainda não vendeu
    (aparece zerado), pra tela mostrar tudo que pertence ao lançamento.
    Ordena por receita, da maior pra menor."""
    linhas = list(vendidas)
    codigos_com_venda = {o.oferta_codigo for o in linhas if o.oferta_codigo}
    produtos_com_venda = {o.produto for o in linhas}
    for v in vinculos:
        if v.oferta_codigo and v.oferta_codigo not in codigos_com_venda:
            codigos_com_venda.add(v.oferta_codigo)
        elif not v.oferta_codigo and v.produto and v.produto not in produtos_com_venda:
            produtos_com_venda.add(v.produto)
        else:
            continue
        linhas.append(
            OfertaVendida(
                produto=v.produto or "Sem produto",
                oferta_codigo=v.oferta_codigo,
                oferta_nome=v.oferta_nome,
                quantidade=0,
                receita=ZERO,
            )
        )
    linhas.sort(key=lambda o: (-o.receita, -o.quantidade, o.produto, o.oferta_nome or ""))
    return linhas


def agrupar_por_produto(
    ofertas: Iterable[OfertaVendida], vinculos: Iterable[_Vinculo]
) -> list[ProdutoVendido]:
    """Junta as linhas por produto, com o subtotal de cada um. Produto que
    mais faturou vem primeiro."""
    inteiros = {v.produto for v in vinculos if not v.oferta_codigo and v.produto}
    por_produto: dict[str, list[OfertaVendida]] = defaultdict(list)
    for oferta in ofertas:
        por_produto[oferta.produto].append(oferta)
    grupos = [
        ProdutoVendido(
            produto=produto,
            inteiro=produto in inteiros,
            quantidade=sum(o.quantidade for o in linhas),
            receita=sum((o.receita for o in linhas), ZERO),
            # Linha zerada e sem código é só o "produto inteiro ainda sem
            # venda" — o subtotal já diz isso, não precisa de linha própria.
            ofertas=[o for o in linhas if o.oferta_codigo or o.quantidade > 0],
        )
        for produto, linhas in por_produto.items()
    ]
    grupos.sort(key=lambda g: (-g.receita, -g.quantidade, g.produto))
    return grupos


def totalizar(ofertas: Iterable[OfertaVendida]) -> TotaisVendas:
    lista = list(ofertas)
    return TotaisVendas(
        quantidade=sum(o.quantidade for o in lista),
        receita=sum((o.receita for o in lista), ZERO),
    )


def periodo_utc(
    inicio: date | None, fim: date | None
) -> tuple[datetime | None, datetime | None]:
    """[inicio 00:00, fim+1 00:00) de Brasília, convertido pra UTC. None
    de um lado = sem limite daquele lado."""
    inicio_dt = (
        datetime.combine(inicio, time.min, tzinfo=BR_TZ).astimezone(timezone.utc)
        if inicio
        else None
    )
    fim_dt = (
        datetime.combine(fim + timedelta(days=1), time.min, tzinfo=BR_TZ).astimezone(
            timezone.utc
        )
        if fim
        else None
    )
    return inicio_dt, fim_dt


# ============================================================
# Subquery de vendas reais
# ============================================================
def _base_dedup(codigos: list[str], produtos: list[str]) -> Subquery:
    """Vendas aprovadas (1ª cobrança) das ofertas/produtos vinculados, com
    o valor efetivo e `rn` = posição da compra dentro do par (email,
    oferta). rn=1 é a venda que conta."""
    valor = func.coalesce(OfertaPreco.valor, Venda.valor).label("v")
    chave = case(
        (Venda.forcar_no_dash.is_(True), cast(Venda.id, String)),
        (
            and_(Venda.comprador_email.is_not(None), Venda.oferta_codigo.is_not(None)),
            Venda.comprador_email + cast(Venda.oferta_codigo, String),
        ),
        else_=cast(Venda.id, String),
    )
    rn = func.row_number().over(partition_by=chave, order_by=Venda.data_venda).label("rn")
    pertence = []
    if codigos:
        pertence.append(Venda.oferta_codigo.in_(codigos))
    if produtos:
        pertence.append(Venda.produto.in_(produtos))
    return (
        select(
            Venda.produto.label("produto"),
            Venda.oferta_codigo.label("oferta_codigo"),
            Venda.oferta_nome.label("oferta_nome"),
            valor,
            Venda.data_venda.label("data_venda"),
            rn,
        )
        .select_from(Venda)
        .outerjoin(OfertaPreco, OfertaPreco.oferta_codigo == Venda.oferta_codigo)
        .where(
            Venda.status == "aprovada",
            or_(Venda.recorrencia_seq.is_(None), Venda.recorrencia_seq == 1),
            or_(*pertence),
        )
        .subquery()
    )


def _vendas_efetivas(
    codigos: list[str], produtos: list[str], inicio: date | None, fim: date | None
) -> Subquery:
    """Vendas reais do lançamento. O filtro de data vem DEPOIS do dedup:
    assim a venda que conta de cada pessoa é sempre a mesma, seja qual for
    o período."""
    base = _base_dedup(codigos, produtos)
    inicio_dt, fim_dt = periodo_utc(inicio, fim)
    stmt = select(base).where(base.c.rn == 1)
    if inicio_dt is not None:
        stmt = stmt.where(base.c.data_venda >= inicio_dt)
    if fim_dt is not None:
        stmt = stmt.where(base.c.data_venda < fim_dt)
    return stmt.subquery()


# ============================================================
# Leitura
# ============================================================
async def listar_vinculos(db: AsyncSession, lancamento_id: UUID) -> list[LancamentoOferta]:
    stmt = (
        select(LancamentoOferta)
        .where(LancamentoOferta.lancamento_id == lancamento_id)
        .order_by(LancamentoOferta.criado_em, LancamentoOferta.id)
    )
    return list((await db.execute(stmt)).scalars().all())


async def vendas_por_oferta(
    db: AsyncSession,
    vinculos: Iterable[_Vinculo],
    inicio: date | None,
    fim: date | None,
) -> list[OfertaVendida]:
    """Quantidade e receita de cada oferta que vendeu no período."""
    codigos, produtos = separar_vinculos(vinculos)
    if not codigos and not produtos:
        return []
    sub = _vendas_efetivas(codigos, produtos, inicio, fim)
    stmt = select(
        sub.c.produto,
        sub.c.oferta_codigo,
        func.max(sub.c.oferta_nome).label("oferta_nome"),
        func.count().label("quantidade"),
        func.coalesce(func.sum(sub.c.v), 0).label("receita"),
    ).group_by(sub.c.produto, sub.c.oferta_codigo)
    return [
        OfertaVendida(
            produto=r.produto,
            oferta_codigo=r.oferta_codigo,
            oferta_nome=r.oferta_nome,
            quantidade=int(r.quantidade),
            receita=Decimal(r.receita),
        )
        for r in (await db.execute(stmt)).all()
    ]


async def vendas_por_dia(
    db: AsyncSession,
    vinculos: Iterable[_Vinculo],
    inicio: date | None,
    fim: date | None,
) -> list[PontoVendaDia]:
    """Receita e quantidade por dia (dia de Brasília) — alimenta o gráfico."""
    codigos, produtos = separar_vinculos(vinculos)
    if not codigos and not produtos:
        return []
    sub = _vendas_efetivas(codigos, produtos, inicio, fim)
    dia = cast(func.timezone(FUSO_BR, sub.c.data_venda), Date).label("dia")
    stmt = (
        select(
            dia,
            func.count().label("quantidade"),
            func.coalesce(func.sum(sub.c.v), 0).label("receita"),
        )
        .group_by(dia)
        .order_by(dia)
    )
    return [
        PontoVendaDia(dia=r.dia, quantidade=int(r.quantidade), receita=Decimal(r.receita))
        for r in (await db.execute(stmt)).all()
    ]


async def totais_por_lancamento(
    db: AsyncSession, lancamentos: list[Lancamento]
) -> dict[UUID, TotaisVendas]:
    """Total de vendas de cada dashboard de vendas da lista. Uma query pros
    vínculos de todos + uma de vendas por lançamento."""
    de_vendas = [l for l in lancamentos if l.tipo == "vendas"]
    if not de_vendas:
        return {}
    stmt = select(LancamentoOferta).where(
        LancamentoOferta.lancamento_id.in_([l.id for l in de_vendas])
    )
    vinculos_por_lancamento: dict[UUID, list[LancamentoOferta]] = defaultdict(list)
    for vinculo in (await db.execute(stmt)).scalars().all():
        vinculos_por_lancamento[vinculo.lancamento_id].append(vinculo)

    totais: dict[UUID, TotaisVendas] = {}
    for l in de_vendas:
        vendidas = await vendas_por_oferta(
            db, vinculos_por_lancamento[l.id], l.data_inicio, l.data_fim
        )
        totais[l.id] = totalizar(vendidas)
    return totais


async def painel(db: AsyncSession, lancamento: LancamentoResponse) -> LancamentoVendasPainel:
    """Monta a tela do dashboard de vendas: seleção, vendas por oferta e
    receita por dia, tudo no período do lançamento."""
    vinculos = await listar_vinculos(db, lancamento.id)
    periodo = (lancamento.data_inicio, lancamento.data_fim)
    vendidas = await vendas_por_oferta(db, vinculos, *periodo)
    return LancamentoVendasPainel(
        lancamento=lancamento,
        vinculos=[VinculoOfertaResponse.model_validate(v) for v in vinculos],
        produtos=agrupar_por_produto(completar_com_vinculos(vendidas, vinculos), vinculos),
        por_dia=await vendas_por_dia(db, vinculos, *periodo),
    )


# ============================================================
# Escrita
# ============================================================
async def substituir_vinculos(
    db: AsyncSession, lancamento_id: UUID, itens: list[VinculoOferta]
) -> bool:
    """Troca a seleção inteira do lançamento pela lista recebida (a tela
    manda sempre o estado final das caixinhas marcadas). False se o
    lançamento não existe."""
    if not await db.get(Lancamento, lancamento_id):
        return False
    await db.execute(
        delete(LancamentoOferta).where(LancamentoOferta.lancamento_id == lancamento_id)
    )
    for item in deduplicar_itens(itens):
        db.add(
            LancamentoOferta(
                lancamento_id=lancamento_id,
                produto=item.produto,
                oferta_codigo=item.oferta_codigo,
                oferta_nome=item.oferta_nome,
            )
        )
    await db.commit()
    return True
