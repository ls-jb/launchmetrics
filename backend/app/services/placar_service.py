"""
Lógica do placar de líderes.

Marcação é ATÔMICA no banco (upsert com GREATEST(0, ...)): duas pessoas
marcando ao mesmo tempo não se sobrescrevem, e a contagem nunca fica negativa.
Ranking (quantidade e receita = soma de qtd × valor da oferta) é calculado no
banco, seguindo a regra de manter cálculo no backend.
"""
from decimal import Decimal
from uuid import UUID

from sqlalchemy import String, and_, case, cast, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    OfertaPreco,
    PlacarContagem,
    PlacarLancamento,
    PlacarOferta,
    PlacarVendedor,
    Venda,
)
from app.schemas.placar import (
    ContagemItem,
    LancamentoResponse,
    OfertaResponse,
    PlacarCompleto,
    RankingItem,
    TotalVendas,
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
    db: AsyncSession,
    lancamento_id: UUID,
    produto: str,
    oferta: str | None,
    oferta_codigo: str | None,
    valor,
) -> PlacarOferta | None:
    if not await db.get(PlacarLancamento, lancamento_id):
        return None
    of = PlacarOferta(
        lancamento_id=lancamento_id,
        produto=produto,
        oferta=oferta,
        oferta_codigo=oferta_codigo,
        valor=valor,
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

    ranking = [
        RankingItem(
            vendedor_id=r[0], nome=r[1], quantidade_total=int(r[2]), receita_total=r[3]
        )
        for r in ranking_rows
    ]
    total_closers = TotalVendas(
        quantidade=sum(it.quantidade_total for it in ranking),
        receita=sum((it.receita_total for it in ranking), Decimal("0")),
    )
    total_real = await _total_real(db, ofertas)

    return PlacarCompleto(
        lancamento=LancamentoResponse.model_validate(lanc),
        ofertas=[OfertaResponse.model_validate(o) for o in ofertas],
        vendedores=[VendedorResponse.model_validate(v) for v in vendedores],
        ranking=ranking,
        contagens=[
            ContagemItem(vendedor_id=c[0], oferta_id=c[1], quantidade=int(c[2]))
            for c in contagens_rows
        ],
        total_real=total_real,
        total_closers=total_closers,
    )


async def _total_real(
    db: AsyncSession, ofertas: list[PlacarOferta]
) -> TotalVendas:
    """Total de vendas REAIS (plataformas) das ofertas configuradas.
    Para cada placar_oferta:
    - se tem oferta_codigo: matcha pelo código específico.
    - se NÃO tem: matcha por produto (conta TODAS as ofertas daquele produto)
      — útil pra alinhar o total com o dashboard que agrega por produto.
    Aplica as mesmas regras do dashboard: override de preço, recorrência
    seq<=1, dedup por email+oferta_codigo, status aprovada."""
    codigos = [o.oferta_codigo for o in ofertas if o.oferta_codigo]
    produtos_sem_codigo = [o.produto for o in ofertas if not o.oferta_codigo]
    if not codigos and not produtos_sem_codigo:
        return TotalVendas(quantidade=0, receita=Decimal("0"))

    criterios = []
    if codigos:
        criterios.append(Venda.oferta_codigo.in_(codigos))
    if produtos_sem_codigo:
        criterios.append(Venda.produto.in_(produtos_sem_codigo))

    valor_efetivo = func.coalesce(OfertaPreco.valor, Venda.valor).label("v")
    dedup_key = case(
        (
            and_(Venda.comprador_email.is_not(None), Venda.oferta_codigo.is_not(None)),
            Venda.comprador_email + cast(Venda.oferta_codigo, String),
        ),
        else_=cast(Venda.id, String),
    )
    rn = func.row_number().over(partition_by=dedup_key, order_by=Venda.data_venda).label("rn")
    base = (
        select(valor_efetivo, rn)
        .select_from(Venda)
        .outerjoin(OfertaPreco, OfertaPreco.oferta_codigo == Venda.oferta_codigo)
        .where(
            or_(*criterios),
            Venda.status == "aprovada",
            or_(Venda.recorrencia_seq.is_(None), Venda.recorrencia_seq == 1),
        )
        .subquery()
    )
    sub = select(base).where(base.c.rn == 1).subquery()
    row = (
        await db.execute(
            select(func.count(), func.coalesce(func.sum(sub.c.v), 0)).select_from(sub)
        )
    ).one()
    return TotalVendas(quantidade=int(row[0]), receita=Decimal(row[1]))
