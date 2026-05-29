"""
Lógica do placar de líderes.

Marcação é ATÔMICA no banco (upsert com GREATEST(0, ...)): duas pessoas
marcando ao mesmo tempo não se sobrescrevem, e a contagem nunca fica negativa.
Ranking (quantidade e receita = soma de qtd × valor da oferta) é calculado no
banco, seguindo a regra de manter cálculo no backend.
"""
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    PlacarContagem,
    PlacarLancamento,
    PlacarOferta,
    PlacarVendedor,
)
from app.schemas.placar import (
    ContagemItem,
    LancamentoResponse,
    OfertaResponse,
    PlacarCompleto,
    RankingItem,
    VendedorResponse,
)


# ============================================================
# Lançamentos
# ============================================================
async def listar_lancamentos(db: AsyncSession) -> list[PlacarLancamento]:
    stmt = select(PlacarLancamento).order_by(
        PlacarLancamento.ativo.desc(), PlacarLancamento.criado_em.desc()
    )
    return list((await db.execute(stmt)).scalars().all())


async def criar_lancamento(db: AsyncSession, nome: str) -> PlacarLancamento:
    lanc = PlacarLancamento(nome=nome)
    db.add(lanc)
    await db.commit()
    await db.refresh(lanc)
    return lanc


async def atualizar_lancamento(
    db: AsyncSession, lancamento_id: UUID, nome: str | None, ativo: bool | None
) -> PlacarLancamento | None:
    lanc = await db.get(PlacarLancamento, lancamento_id)
    if not lanc:
        return None
    if nome is not None:
        lanc.nome = nome
    if ativo is not None:
        if ativo:
            # só um ativo por vez: desativa os outros
            await db.execute(
                update(PlacarLancamento)
                .where(PlacarLancamento.id != lancamento_id)
                .values(ativo=False)
            )
        lanc.ativo = ativo
    await db.commit()
    await db.refresh(lanc)
    return lanc


async def remover_lancamento(db: AsyncSession, lancamento_id: UUID) -> bool:
    lanc = await db.get(PlacarLancamento, lancamento_id)
    if not lanc:
        return False
    await db.delete(lanc)  # cascade remove ofertas/vendedores/contagens
    await db.commit()
    return True


# ============================================================
# Ofertas / Vendedores
# ============================================================
async def adicionar_oferta(
    db: AsyncSession, lancamento_id: UUID, produto: str, oferta: str | None, valor
) -> PlacarOferta | None:
    if not await db.get(PlacarLancamento, lancamento_id):
        return None
    of = PlacarOferta(
        lancamento_id=lancamento_id, produto=produto, oferta=oferta, valor=valor
    )
    db.add(of)
    await db.commit()
    await db.refresh(of)
    return of


async def remover_oferta(db: AsyncSession, oferta_id: UUID) -> bool:
    of = await db.get(PlacarOferta, oferta_id)
    if not of:
        return False
    await db.delete(of)
    await db.commit()
    return True


async def adicionar_vendedor(
    db: AsyncSession, lancamento_id: UUID, nome: str
) -> PlacarVendedor | None:
    if not await db.get(PlacarLancamento, lancamento_id):
        return None
    v = PlacarVendedor(lancamento_id=lancamento_id, nome=nome)
    db.add(v)
    await db.commit()
    await db.refresh(v)
    return v


async def remover_vendedor(db: AsyncSession, vendedor_id: UUID) -> bool:
    v = await db.get(PlacarVendedor, vendedor_id)
    if not v:
        return False
    await db.delete(v)
    await db.commit()
    return True


# ============================================================
# Marcação (atômica)
# ============================================================
async def marcar(
    db: AsyncSession, vendedor_id: UUID, oferta_id: UUID, delta: int
) -> int:
    """Soma `delta` (+1/-1) na contagem (vendedor, oferta). Piso em 0. Atômico."""
    nova_qtd = func.greatest(0, PlacarContagem.quantidade + delta)
    stmt = (
        pg_insert(PlacarContagem)
        .values(
            vendedor_id=vendedor_id,
            oferta_id=oferta_id,
            quantidade=func.greatest(0, delta),
        )
        .on_conflict_do_update(
            constraint="uq_placar_contagem",
            set_={"quantidade": nova_qtd, "atualizado_em": func.now()},
        )
        .returning(PlacarContagem.quantidade)
    )
    qtd = (await db.execute(stmt)).scalar_one()
    await db.commit()
    return int(qtd)


# ============================================================
# Leitura do placar completo
# ============================================================
async def obter_placar(db: AsyncSession, lancamento_id: UUID) -> PlacarCompleto | None:
    lanc = await db.get(PlacarLancamento, lancamento_id)
    if not lanc:
        return None

    ofertas = list(
        (
            await db.execute(
                select(PlacarOferta)
                .where(PlacarOferta.lancamento_id == lancamento_id)
                .order_by(PlacarOferta.produto, PlacarOferta.criado_em)
            )
        )
        .scalars()
        .all()
    )
    vendedores = list(
        (
            await db.execute(
                select(PlacarVendedor)
                .where(PlacarVendedor.lancamento_id == lancamento_id)
                .order_by(PlacarVendedor.nome)
            )
        )
        .scalars()
        .all()
    )

    # contagens > 0 do lançamento
    contagens_rows = (
        await db.execute(
            select(
                PlacarContagem.vendedor_id,
                PlacarContagem.oferta_id,
                PlacarContagem.quantidade,
            )
            .join(PlacarVendedor, PlacarVendedor.id == PlacarContagem.vendedor_id)
            .where(
                PlacarVendedor.lancamento_id == lancamento_id,
                PlacarContagem.quantidade > 0,
            )
        )
    ).all()

    # ranking: qtd e receita por vendedor (inclui quem tem 0)
    qtd_total = func.coalesce(func.sum(PlacarContagem.quantidade), 0).label("qtd")
    receita_total = func.coalesce(
        func.sum(PlacarContagem.quantidade * PlacarOferta.valor), 0
    ).label("receita")
    ranking_rows = (
        await db.execute(
            select(PlacarVendedor.id, PlacarVendedor.nome, qtd_total, receita_total)
            .select_from(PlacarVendedor)
            .outerjoin(PlacarContagem, PlacarContagem.vendedor_id == PlacarVendedor.id)
            .outerjoin(PlacarOferta, PlacarOferta.id == PlacarContagem.oferta_id)
            .where(PlacarVendedor.lancamento_id == lancamento_id)
            .group_by(PlacarVendedor.id, PlacarVendedor.nome)
            .order_by(receita_total.desc(), qtd_total.desc(), PlacarVendedor.nome)
        )
    ).all()

    return PlacarCompleto(
        lancamento=LancamentoResponse.model_validate(lanc),
        ofertas=[OfertaResponse.model_validate(o) for o in ofertas],
        vendedores=[VendedorResponse.model_validate(v) for v in vendedores],
        ranking=[
            RankingItem(
                vendedor_id=r[0], nome=r[1], quantidade_total=int(r[2]), receita_total=r[3]
            )
            for r in ranking_rows
        ],
        contagens=[
            ContagemItem(vendedor_id=c[0], oferta_id=c[1], quantidade=int(c[2]))
            for c in contagens_rows
        ],
    )
