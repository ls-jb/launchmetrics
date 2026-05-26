"""
Agregações e filtros do dashboard de vendas.
Todas as funções aceitam o mesmo filtro padrão: data range + produto + oferta.
Por padrão, só consideram vendas com status='aprovada'.
"""
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

from sqlalchemy import Date, cast, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import Select

from app.models import Venda
from app.schemas.venda import PontoReceita, ProdutoRanking, ResumoVendas

ZERO = Decimal("0")
STATUS_FATURADO = "aprovada"


# ============================================================
# Operações públicas
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
    stmt = select(Venda).order_by(Venda.data_venda.desc())
    stmt = _aplicar_filtros(stmt, inicio, fim, produto, oferta)
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
    stmt = _aplicar_filtros(stmt, inicio, fim, produto, oferta)
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
    stmt = _aplicar_filtros(stmt, inicio, fim, produto, oferta)
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
    stmt = _aplicar_filtros(stmt, inicio, fim, produto, oferta)
    rows = (await db.execute(stmt)).all()
    return [
        ProdutoRanking(produto=r.produto, quantidade=r.quantidade, receita=r.receita)
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
# Helpers privados
# ============================================================
def _range_utc(inicio: date, fim: date) -> tuple[datetime, datetime]:
    """Converte YYYY-MM-DD em range [inicio_00, fim+1_00) UTC para usar índice."""
    inicio_dt = datetime.combine(inicio, time.min, tzinfo=timezone.utc)
    fim_dt = datetime.combine(fim + timedelta(days=1), time.min, tzinfo=timezone.utc)
    return inicio_dt, fim_dt


def _aplicar_filtros(
    stmt: Select,
    inicio: date,
    fim: date,
    produto: str | None,
    oferta: str | None,
) -> Select:
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
