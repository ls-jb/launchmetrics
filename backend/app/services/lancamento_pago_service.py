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
    LancamentoPagoAjuste,
    LancamentoPagoOferta,
    OfertaPreco,
    Venda,
)
from app.schemas.lancamento_pago import (
    AjusteResponse,
    LancamentoPagoCompleto,
    LancamentoPagoResponse,
    OfertaDetalhe,
    TotalCategoria,
)

CATEGORIAS_INGRESSO = {"ingresso", "order_bump_ingresso"}
"""Conta vendas no intervalo ingresso_inicio..ingresso_fim do lançamento."""

CATEGORIAS_PRINCIPAL = {"principal", "order_bump_principal", "upsell", "downsell"}
"""Conta vendas no intervalo principal_inicio..principal_fim do lançamento."""


# ============================================================
# Lançamentos
# ============================================================
async def listar(db: AsyncSession) -> list[LancamentoPago]:
    stmt = select(LancamentoPago).order_by(LancamentoPago.ingresso_inicio.desc())
    return list((await db.execute(stmt)).scalars().all())


async def criar(
    db: AsyncSession,
    nome: str,
    ingresso_inicio: date,
    ingresso_fim: date,
    principal_inicio: date,
    principal_fim: date,
) -> LancamentoPago:
    lanc = LancamentoPago(
        nome=nome,
        ingresso_inicio=ingresso_inicio,
        ingresso_fim=ingresso_fim,
        principal_inicio=principal_inicio,
        principal_fim=principal_fim,
    )
    db.add(lanc)
    await db.commit()
    await db.refresh(lanc)
    return lanc


async def atualizar(
    db: AsyncSession,
    lancamento_id: UUID,
    nome: str | None,
    ingresso_inicio: date | None,
    ingresso_fim: date | None,
    principal_inicio: date | None,
    principal_fim: date | None,
) -> LancamentoPago | None:
    lanc = await db.get(LancamentoPago, lancamento_id)
    if not lanc:
        return None
    if nome is not None:
        lanc.nome = nome
    if ingresso_inicio is not None:
        lanc.ingresso_inicio = ingresso_inicio
    if ingresso_fim is not None:
        lanc.ingresso_fim = ingresso_fim
    if principal_inicio is not None:
        lanc.principal_inicio = principal_inicio
    if principal_fim is not None:
        lanc.principal_fim = principal_fim
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
        totais_por_categoria=totais,
    )


async def _totais_por_categoria(
    db: AsyncSession,
    lanc: LancamentoPago,
    ofertas: list[LancamentoPagoOferta],
) -> list[TotalCategoria]:
    """Totais por categoria + breakdown por oferta (real + ajustes manuais).

    Ingresso e Order Bump Ingresso usam a janela [data_inicio, abertura-1].
    Principal/Bumps/Upsell/Downsell usam [abertura_carrinho, data_fim].
    Ofertas sem código (digitadas à mão) ficam com 0 venda real, mas ajustes
    manuais cadastrados nelas contam normalmente.
    """
    if not ofertas:
        return []

    # 1) Métricas reais por oferta_codigo, com janela específica por grupo.
    codigos_ingresso = [
        o.oferta_codigo
        for o in ofertas
        if o.categoria in CATEGORIAS_INGRESSO and o.oferta_codigo
    ]
    codigos_principal = [
        o.oferta_codigo
        for o in ofertas
        if o.categoria in CATEGORIAS_PRINCIPAL and o.oferta_codigo
    ]
    metricas = await _metricas_por_codigo(
        db, codigos_ingresso, lanc.ingresso_inicio, lanc.ingresso_fim
    )
    metricas.update(
        await _metricas_por_codigo(
            db, codigos_principal, lanc.principal_inicio, lanc.principal_fim
        )
    )

    # 2) Ajustes manuais por oferta (lancamento_pagos_ajustes).
    ids = [o.id for o in ofertas]
    ajustes_rows = list(
        (
            await db.execute(
                select(LancamentoPagoAjuste)
                .where(LancamentoPagoAjuste.lancamento_oferta_id.in_(ids))
                .order_by(LancamentoPagoAjuste.criado_em)
            )
        )
        .scalars()
        .all()
    )
    ajustes_por_oferta: dict = defaultdict(list)
    for aj in ajustes_rows:
        ajustes_por_oferta[aj.lancamento_oferta_id].append(aj)

    # 3) Monta OfertaDetalhe (real + ajustes), agrupa por categoria.
    por_cat: dict[str, list[OfertaDetalhe]] = defaultdict(list)
    for o in ofertas:
        qtd_real, receita_real = (
            metricas.get(o.oferta_codigo, (0, Decimal("0")))
            if o.oferta_codigo
            else (0, Decimal("0"))
        )
        ajs = ajustes_por_oferta.get(o.id, [])
        qtd_manual = sum(a.quantidade for a in ajs)
        receita_manual = sum((Decimal(a.quantidade) * a.valor for a in ajs), Decimal("0"))
        por_cat[o.categoria].append(
            OfertaDetalhe(
                id=o.id,
                produto=o.produto,
                oferta_nome=o.oferta_nome,
                oferta_codigo=o.oferta_codigo,
                quantidade=qtd_real + qtd_manual,
                receita=receita_real + receita_manual,
                quantidade_manual=qtd_manual,
                receita_manual=receita_manual,
                ajustes=[AjusteResponse.model_validate(a) for a in ajs],
            )
        )

    # 4) Monta TotalCategoria na ordem fixa, ordenando ofertas por receita desc.
    ordem = [
        "ingresso",
        "order_bump_ingresso",
        "principal",
        "order_bump_principal",
        "upsell",
        "downsell",
    ]
    result: list[TotalCategoria] = []
    for cat in ordem:
        detalhes = por_cat.get(cat, [])
        if not detalhes:
            continue
        detalhes_sorted = sorted(
            detalhes,
            key=lambda d: (-d.receita, -d.quantidade, d.oferta_nome or ""),
        )
        qtd_total = sum(d.quantidade for d in detalhes_sorted)
        receita_total = sum((d.receita for d in detalhes_sorted), Decimal("0"))
        result.append(
            TotalCategoria(
                categoria=cat,  # type: ignore[arg-type]
                quantidade=qtd_total,
                receita=receita_total,
                ofertas=detalhes_sorted,
            )
        )
    return result


async def _metricas_por_codigo(
    db: AsyncSession,
    codigos: list[str],
    inicio: date,
    fim: date,
) -> dict[str, tuple[int, Decimal]]:
    """Retorna {oferta_codigo: (qtd, receita_efetiva)} para vendas reais
    aprovadas com recorrência seq<=1, dedup por email+codigo, override do
    ofertas_precos aplicado, na janela [inicio, fim] inclusive."""
    if not codigos or fim < inicio:
        return {}

    inicio_dt = datetime.combine(inicio, datetime.min.time(), tzinfo=timezone.utc)
    fim_dt = datetime.combine(fim + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc)

    valor_efetivo = func.coalesce(OfertaPreco.valor, Venda.valor).label("v")
    dedup_key = case(
        (
            and_(
                Venda.comprador_email.is_not(None),
                Venda.oferta_codigo.is_not(None),
            ),
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
            Venda.oferta_codigo.in_(codigos),
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
    return {codigo: (int(qtd), Decimal(receita)) for codigo, qtd, receita in rows}


# ============================================================
# Ajustes manuais (vendas visuais — não tocam `vendas`)
# ============================================================
async def adicionar_ajuste(
    db: AsyncSession,
    oferta_id: UUID,
    quantidade: int,
    valor,
    descricao: str | None,
) -> LancamentoPagoAjuste | None:
    if not await db.get(LancamentoPagoOferta, oferta_id):
        return None
    aj = LancamentoPagoAjuste(
        lancamento_oferta_id=oferta_id,
        quantidade=quantidade,
        valor=valor,
        descricao=descricao,
    )
    db.add(aj)
    await db.commit()
    await db.refresh(aj)
    return aj


async def remover_ajuste(db: AsyncSession, ajuste_id: UUID) -> bool:
    aj = await db.get(LancamentoPagoAjuste, ajuste_id)
    if not aj:
        return False
    await db.delete(aj)
    await db.commit()
    return True
