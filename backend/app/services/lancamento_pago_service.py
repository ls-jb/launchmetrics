"""
Lógica do Lançamento Pago.

Lançamento pago é um agrupamento de ofertas reais (com categoria) numa janela
de datas. As métricas são calculadas em cima das `vendas` reais — mesma regra
do dashboard: override de `ofertas_precos`, dedup por email+oferta_codigo,
recorrência seq<=1, status aprovada. Não tem dado próprio de venda.
"""
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from sqlalchemy import String, and_, case, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    LancamentoPago,
    LancamentoPagoOferta,
    OfertaPreco,
    Venda,
)
from app.schemas.lancamento_pago import (
    LancamentoPagoCompleto,
    LancamentoPagoResponse,
    OfertaResponse,
    TotalCategoria,
)

JANELA_POS_CARRINHO_DIAS = 5
"""data_fim = data_abertura_carrinho + 5 dias (vendas continuam saindo por
~4-5 dias depois do pitch)."""


def _calcular_fim(abertura: date) -> date:
    return abertura + timedelta(days=JANELA_POS_CARRINHO_DIAS)


# ============================================================
# Lançamentos
# ============================================================
async def listar(db: AsyncSession) -> list[LancamentoPago]:
    stmt = select(LancamentoPago).order_by(LancamentoPago.data_inicio.desc())
    return list((await db.execute(stmt)).scalars().all())


async def criar(
    db: AsyncSession, nome: str, data_inicio: date, data_abertura_carrinho: date
) -> LancamentoPago:
    lanc = LancamentoPago(
        nome=nome,
        data_inicio=data_inicio,
        data_abertura_carrinho=data_abertura_carrinho,
        data_fim=_calcular_fim(data_abertura_carrinho),
    )
    db.add(lanc)
    await db.commit()
    await db.refresh(lanc)
    return lanc


async def atualizar(
    db: AsyncSession,
    lancamento_id: UUID,
    nome: str | None,
    data_inicio: date | None,
    data_abertura_carrinho: date | None,
) -> LancamentoPago | None:
    lanc = await db.get(LancamentoPago, lancamento_id)
    if not lanc:
        return None
    if nome is not None:
        lanc.nome = nome
    if data_inicio is not None:
        lanc.data_inicio = data_inicio
    if data_abertura_carrinho is not None:
        lanc.data_abertura_carrinho = data_abertura_carrinho
        lanc.data_fim = _calcular_fim(data_abertura_carrinho)
    await db.commit()
    await db.refresh(lanc)
    return lanc


async def remover(db: AsyncSession, lancamento_id: UUID) -> bool:
    lanc = await db.get(LancamentoPago, lancamento_id)
    if not lanc:
        return False
    await db.delete(lanc)
    await db.commit()
    return True


# ============================================================
# Ofertas
# ============================================================
async def adicionar_oferta(
    db: AsyncSession,
    lancamento_id: UUID,
    produto: str,
    oferta_nome: str | None,
    oferta_codigo: str | None,
    categoria: str,
) -> LancamentoPagoOferta | None:
    if not await db.get(LancamentoPago, lancamento_id):
        return None
    of = LancamentoPagoOferta(
        lancamento_id=lancamento_id,
        produto=produto,
        oferta_nome=oferta_nome,
        oferta_codigo=oferta_codigo,
        categoria=categoria,
    )
    db.add(of)
    await db.commit()
    await db.refresh(of)
    return of


async def remover_oferta(db: AsyncSession, oferta_id: UUID) -> bool:
    of = await db.get(LancamentoPagoOferta, oferta_id)
    if not of:
        return False
    await db.delete(of)
    await db.commit()
    return True


# ============================================================
# Detalhe completo (com totais reais por categoria)
# ============================================================
async def obter(
    db: AsyncSession, lancamento_id: UUID
) -> LancamentoPagoCompleto | None:
    lanc = await db.get(LancamentoPago, lancamento_id)
    if not lanc:
        return None

    ofertas = list(
        (
            await db.execute(
                select(LancamentoPagoOferta)
                .where(LancamentoPagoOferta.lancamento_id == lancamento_id)
                .order_by(LancamentoPagoOferta.categoria, LancamentoPagoOferta.criado_em)
            )
        )
        .scalars()
        .all()
    )

    totais = await _totais_por_categoria(db, lanc, ofertas)

    return LancamentoPagoCompleto(
        lancamento=LancamentoPagoResponse.model_validate(lanc),
        ofertas=[OfertaResponse.model_validate(o) for o in ofertas],
        totais_por_categoria=totais,
    )


async def _totais_por_categoria(
    db: AsyncSession,
    lanc: LancamentoPago,
    ofertas: list[LancamentoPagoOferta],
) -> list[TotalCategoria]:
    """Soma das vendas reais por categoria, dentro da janela do lançamento."""
    codigo_categoria = {
        o.oferta_codigo: o.categoria for o in ofertas if o.oferta_codigo
    }
    if not codigo_categoria:
        return []

    inicio_dt = datetime.combine(
        lanc.data_inicio, datetime.min.time(), tzinfo=timezone.utc
    )
    fim_dt = datetime.combine(
        lanc.data_fim + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc
    )

    valor_efetivo = func.coalesce(OfertaPreco.valor, Venda.valor).label("v")
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
        select(Venda.oferta_codigo.label("codigo"), valor_efetivo, rn)
        .select_from(Venda)
        .outerjoin(OfertaPreco, OfertaPreco.oferta_codigo == Venda.oferta_codigo)
        .where(
            Venda.oferta_codigo.in_(list(codigo_categoria.keys())),
            Venda.status == "aprovada",
            or_(Venda.recorrencia_seq.is_(None), Venda.recorrencia_seq == 1),
            Venda.data_venda >= inicio_dt,
            Venda.data_venda < fim_dt,
        )
        .subquery()
    )
    sub = select(base.c.codigo, base.c.v).where(base.c.rn == 1).subquery()
    rows = (
        await db.execute(
            select(sub.c.codigo, func.count(), func.coalesce(func.sum(sub.c.v), 0))
            .group_by(sub.c.codigo)
        )
    ).all()

    acumulado: dict[str, list] = defaultdict(lambda: [0, Decimal("0")])
    for codigo, qtd, receita in rows:
        cat = codigo_categoria[codigo]
        acumulado[cat][0] += int(qtd)
        acumulado[cat][1] += Decimal(receita)

    # ordem fixa pras categorias aparecerem sempre na mesma sequência
    ordem = [
        "ingresso",
        "order_bump_ingresso",
        "principal",
        "order_bump_principal",
        "upsell",
        "downsell",
    ]
    return [
        TotalCategoria(categoria=c, quantidade=acumulado[c][0], receita=acumulado[c][1])  # type: ignore[arg-type]
        for c in ordem
        if c in acumulado
    ]
