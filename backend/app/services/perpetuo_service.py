"""
Lógica dos Perpétuos.

Cada perpétuo agrupa N ofertas (oferta_codigo) e tem um histórico de
aportes diários. As métricas usam a MESMA regra de venda real do dashboard
(override de ofertas_precos + dedup por email+oferta_codigo + recorrência
seq<=1 + status aprovada), aplicada à janela [inicio, fim] em BRT — onde
inicio default é perpetuo.data_inicio e fim default é hoje.
"""
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

BR_TZ = ZoneInfo("America/Sao_Paulo")

from sqlalchemy import Date, String, and_, case, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import delete as sql_delete

from app.models import (
    OfertaPreco,
    Perpetuo,
    PerpetuoAporte,
    PerpetuoOferta,
    Venda,
)
from app.schemas.perpetuo import (
    AporteResponse,
    OfertaDetalhe,
    PerpetuoCompleto,
    PerpetuoResponse,
    PontoInvestimentoDia,
    PontoVendaCategoria,
)
from app.services import meta_ads_service


# ============================================================
# Heurística de categoria (mesma do guru_service, pra consistência)
# ============================================================
def _categoria_da_oferta(oferta_nome: str | None) -> str:
    """Mapeia nome da oferta pra Principal/Order Bump/Upsell/Downsell/Outros."""
    nome = (oferta_nome or "").lower()
    if "order bump" in nome or "orderbump" in nome:
        return "Order Bump"
    if "upsell" in nome:
        return "Upsell"
    if "downsell" in nome:
        return "Downsell"
    if "principal" in nome:
        return "Principal"
    return "Outros"


# ============================================================
# CRUD do perpétuo
# ============================================================
async def listar(db: AsyncSession) -> list[Perpetuo]:
    stmt = select(Perpetuo).order_by(Perpetuo.criado_em.desc())
    return list((await db.execute(stmt)).scalars().all())


async def criar(
    db: AsyncSession,
    nome: str,
    data_inicio: date,
    investimento: Decimal,
    produtos: list[str],  # ignorado — legacy do schema, mantido pra compat
) -> Perpetuo:
    # produtos chega vazio agora (UI moveu pra cadastrar ofertas depois).
    # Investimento aqui também é legacy — fonte de verdade são os aportes.
    _ = produtos
    perp = Perpetuo(
        nome=nome,
        data_inicio=data_inicio,
        investimento=investimento or Decimal("0"),
    )
    db.add(perp)
    await db.commit()
    await db.refresh(perp)
    return perp


async def atualizar(
    db: AsyncSession,
    perpetuo_id: UUID,
    nome: str | None,
    data_inicio: date | None,
    investimento: Decimal | None,
    meta_ad_account_id: str | None = None,
    meta_filtro_nome: str | None = None,
    *,
    atualizar_meta: bool = False,
) -> Perpetuo | None:
    perp = await db.get(Perpetuo, perpetuo_id)
    if not perp:
        return None
    if nome is not None:
        perp.nome = nome
    if data_inicio is not None:
        perp.data_inicio = data_inicio
    if investimento is not None:
        perp.investimento = investimento
    # Campos Meta usam flag explícita pra permitir setar como NULL
    # (limpar o vínculo), o que `is not None` não cobre.
    if atualizar_meta:
        perp.meta_ad_account_id = meta_ad_account_id
        perp.meta_filtro_nome = meta_filtro_nome
    await db.commit()
    await db.refresh(perp)
    return perp


async def remover(db: AsyncSession, perpetuo_id: UUID) -> bool:
    perp = await db.get(Perpetuo, perpetuo_id)
    if not perp:
        return False
    await db.delete(perp)
    await db.commit()
    return True


# ============================================================
# Ofertas do perpétuo
# ============================================================
async def adicionar_oferta(
    db: AsyncSession,
    perpetuo_id: UUID,
    oferta_codigo: str,
    oferta_nome: str | None,
) -> PerpetuoOferta | None:
    if not await db.get(Perpetuo, perpetuo_id):
        return None
    item = PerpetuoOferta(
        perpetuo_id=perpetuo_id,
        oferta_codigo=oferta_codigo.strip(),
        oferta_nome=(oferta_nome or "").strip() or None,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def remover_oferta(db: AsyncSession, oferta_id: UUID) -> bool:
    item = await db.get(PerpetuoOferta, oferta_id)
    if not item:
        return False
    await db.delete(item)
    await db.commit()
    return True


# ============================================================
# Aportes
# ============================================================
async def adicionar_aporte(
    db: AsyncSession,
    perpetuo_id: UUID,
    dia: date,
    valor: Decimal,
    descricao: str | None,
) -> PerpetuoAporte | None:
    if not await db.get(Perpetuo, perpetuo_id):
        return None
    aporte = PerpetuoAporte(
        perpetuo_id=perpetuo_id, dia=dia, valor=valor, descricao=descricao
    )
    db.add(aporte)
    await db.commit()
    await db.refresh(aporte)
    return aporte


async def remover_aporte(db: AsyncSession, aporte_id: UUID) -> bool:
    aporte = await db.get(PerpetuoAporte, aporte_id)
    if not aporte:
        return False
    await db.delete(aporte)
    await db.commit()
    return True


# ============================================================
# Detalhe completo (com filtro de data)
# ============================================================
async def obter(
    db: AsyncSession,
    perpetuo_id: UUID,
    inicio: date | None = None,
    fim: date | None = None,
) -> PerpetuoCompleto | None:
    perp = await db.get(Perpetuo, perpetuo_id)
    if not perp:
        return None

    # Janela efetiva: default = data_inicio..hoje. Frontend manda outra
    # quando o usuário escolhe um período menor.
    inicio_efetivo = inicio or perp.data_inicio
    fim_efetivo = fim or date.today()

    ofertas_cadastradas = list(
        (
            await db.execute(
                select(PerpetuoOferta)
                .where(PerpetuoOferta.perpetuo_id == perpetuo_id)
                .order_by(PerpetuoOferta.criado_em)
            )
        )
        .scalars()
        .all()
    )

    detalhes = await _ofertas_com_metricas(
        db, ofertas_cadastradas, inicio_efetivo, fim_efetivo
    )

    aportes_rows = list(
        (
            await db.execute(
                select(PerpetuoAporte)
                .where(PerpetuoAporte.perpetuo_id == perpetuo_id)
                .order_by(PerpetuoAporte.dia)
            )
        )
        .scalars()
        .all()
    )
    aportes = [AporteResponse.model_validate(a) for a in aportes_rows]

    # KPIs no período (investimento = aportes só dentro da janela)
    investimento_total = sum(
        (Decimal(a.valor) for a in aportes if inicio_efetivo <= a.dia <= fim_efetivo),
        Decimal("0"),
    )
    receita_total = sum((d.receita for d in detalhes), Decimal("0"))
    quantidade_total = sum(d.quantidade for d in detalhes)

    return PerpetuoCompleto(
        perpetuo=PerpetuoResponse.model_validate(perp),
        inicio=inicio_efetivo,
        fim=fim_efetivo,
        ofertas=detalhes,
        aportes=aportes,
        investimento_total=investimento_total,
        receita_total=receita_total,
        quantidade_total=quantidade_total,
    )


async def _ofertas_com_metricas(
    db: AsyncSession,
    ofertas: list[PerpetuoOferta],
    inicio: date,
    fim: date,
) -> list[OfertaDetalhe]:
    """Pra cada oferta cadastrada: qtd + receita no período + categoria
    heurística. Vendas batem pelo oferta_codigo exato."""
    if not ofertas:
        return []
    codigos = [o.oferta_codigo for o in ofertas]
    inicio_dt, fim_dt = _range_utc(inicio, fim)
    sub = _vendas_efetivas_subquery(codigos, inicio_dt, fim_dt)

    rows = (
        await db.execute(
            select(
                sub.c.oferta_codigo,
                func.count().label("qtd"),
                func.coalesce(func.sum(sub.c.v), 0).label("receita"),
            ).group_by(sub.c.oferta_codigo)
        )
    ).all()

    metricas: dict[str, tuple[int, Decimal]] = {
        r.oferta_codigo: (int(r.qtd), Decimal(r.receita)) for r in rows
    }

    detalhes: list[OfertaDetalhe] = []
    for o in ofertas:
        qtd, receita = metricas.get(o.oferta_codigo, (0, Decimal("0")))
        detalhes.append(
            OfertaDetalhe(
                id=o.id,
                oferta_codigo=o.oferta_codigo,
                oferta_nome=o.oferta_nome,
                categoria=_categoria_da_oferta(o.oferta_nome),  # type: ignore[arg-type]
                quantidade=qtd,
                receita=receita,
            )
        )
    # Receita desc; sem venda vai pro fim
    detalhes.sort(key=lambda d: (-d.receita, -d.quantidade, d.oferta_nome or ""))
    return detalhes


# ============================================================
# Gráfico diário — vendas por categoria + investimento
# ============================================================
async def vendas_por_dia_categoria(
    db: AsyncSession,
    perpetuo_id: UUID,
    inicio: date | None = None,
    fim: date | None = None,
) -> list[PontoVendaCategoria]:
    """Pontos (dia BRT × categoria) com qtd e receita, no período."""
    perp = await db.get(Perpetuo, perpetuo_id)
    if not perp:
        return []
    inicio_efetivo = inicio or perp.data_inicio
    fim_efetivo = fim or date.today()

    ofertas = list(
        (
            await db.execute(
                select(PerpetuoOferta).where(
                    PerpetuoOferta.perpetuo_id == perpetuo_id
                )
            )
        )
        .scalars()
        .all()
    )
    if not ofertas:
        return []
    codigo_para_cat = {
        o.oferta_codigo: _categoria_da_oferta(o.oferta_nome) for o in ofertas
    }

    inicio_dt, fim_dt = _range_utc(inicio_efetivo, fim_efetivo)
    sub = _vendas_efetivas_subquery(list(codigo_para_cat.keys()), inicio_dt, fim_dt)

    dia_brt = cast(
        func.timezone("America/Sao_Paulo", sub.c.data_venda), Date
    ).label("dia")
    rows = (
        await db.execute(
            select(
                sub.c.oferta_codigo,
                dia_brt,
                func.count().label("qtd"),
                func.coalesce(func.sum(sub.c.v), 0).label("receita"),
            ).group_by(sub.c.oferta_codigo, dia_brt)
        )
    ).all()

    # Soma por (dia × categoria), agregando os códigos da mesma categoria
    agregado: dict[tuple[date, str], tuple[int, Decimal]] = defaultdict(
        lambda: (0, Decimal("0"))
    )
    for r in rows:
        cat = codigo_para_cat[r.oferta_codigo]
        ant_qtd, ant_rec = agregado[(r.dia, cat)]
        agregado[(r.dia, cat)] = (
            ant_qtd + int(r.qtd),
            ant_rec + Decimal(r.receita),
        )

    return [
        PontoVendaCategoria(
            dia=dia,
            categoria=cat,  # type: ignore[arg-type]
            quantidade=qtd,
            receita=receita,
        )
        for (dia, cat), (qtd, receita) in sorted(agregado.items())
    ]


async def investimento_por_dia(
    db: AsyncSession,
    perpetuo_id: UUID,
    inicio: date | None = None,
    fim: date | None = None,
) -> list[PontoInvestimentoDia]:
    """Soma de aportes por dia dentro do período. Pra barra de investimento
    sobreposta no gráfico."""
    perp = await db.get(Perpetuo, perpetuo_id)
    if not perp:
        return []
    inicio_efetivo = inicio or perp.data_inicio
    fim_efetivo = fim or date.today()

    rows = (
        await db.execute(
            select(
                PerpetuoAporte.dia,
                func.coalesce(func.sum(PerpetuoAporte.valor), 0).label("valor"),
            )
            .where(
                PerpetuoAporte.perpetuo_id == perpetuo_id,
                PerpetuoAporte.dia >= inicio_efetivo,
                PerpetuoAporte.dia <= fim_efetivo,
            )
            .group_by(PerpetuoAporte.dia)
            .order_by(PerpetuoAporte.dia)
        )
    ).all()
    return [PontoInvestimentoDia(dia=r.dia, valor=Decimal(r.valor)) for r in rows]


# ============================================================
# Helpers compartilhados (dedup + override + janela BRT)
# ============================================================
def _range_utc(inicio: date, fim: date) -> tuple[datetime, datetime]:
    """[inicio, fim+1) em BRT convertido pra UTC."""
    inicio_dt = datetime.combine(inicio, time.min, tzinfo=BR_TZ).astimezone(timezone.utc)
    fim_dt = datetime.combine(
        fim + timedelta(days=1), time.min, tzinfo=BR_TZ
    ).astimezone(timezone.utc)
    return inicio_dt, fim_dt


def _vendas_efetivas_subquery(codigos: list[str], inicio_dt, fim_dt):
    """Filtra por oferta_codigo IN codigos, aplica regra de venda real do
    dashboard (status=aprovada, recorrência seq<=1, override de ofertas_precos,
    dedup por email+codigo)."""
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
        select(
            Venda.oferta_codigo.label("oferta_codigo"),
            valor_efetivo,
            Venda.data_venda.label("data_venda"),
            rn,
        )
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
    return (
        select(base.c.oferta_codigo, base.c.v, base.c.data_venda)
        .where(base.c.rn == 1)
        .subquery()
    )


DESCRICAO_META = "Meta Ads — sync automático"
"""Marca os aportes vindos da sincronização Meta Ads. Permite diferenciar
do que foi cadastrado manualmente (e refazer o UPSERT só nesses)."""


async def sincronizar_meta_perpetuo(
    db: AsyncSession,
    perpetuo_id: UUID,
    dias_retroativos: int = 3,
) -> dict:
    """
    Puxa o gasto Meta Ads dos últimos N dias pra esse perpétuo e atualiza
    os aportes (UPSERT). Re-puxar últimos 3 dias por default cobre o
    delay/correção retroativa da Meta.

    Idempotente — apaga só aportes da janela cuja descricao == DESCRICAO_META,
    mantém aportes manuais. Roda mesmo se o perpétuo não tiver Meta
    configurado: nesse caso vira no-op e retorna 0 dias.

    Retorna {dias: N, total: Decimal, periodo: [inicio, fim]}.
    """
    perp = await db.get(Perpetuo, perpetuo_id)
    if not perp or not perp.meta_ad_account_id:
        return {"dias": 0, "total": Decimal("0"), "periodo": None}

    fim = date.today()
    inicio = fim - timedelta(days=max(dias_retroativos, 0))

    gastos = await meta_ads_service.puxar_gasto_por_dia(
        perp.meta_ad_account_id, inicio, fim, perp.meta_filtro_nome
    )
    if not gastos:
        return {
            "dias": 0,
            "total": Decimal("0"),
            "periodo": [inicio.isoformat(), fim.isoformat()],
        }

    # Apaga os aportes da sync nesses dias (preserva aportes manuais)
    await db.execute(
        sql_delete(PerpetuoAporte).where(
            PerpetuoAporte.perpetuo_id == perpetuo_id,
            PerpetuoAporte.dia >= inicio,
            PerpetuoAporte.dia <= fim,
            PerpetuoAporte.descricao == DESCRICAO_META,
        )
    )

    # Insere os novos
    for dia, valor in gastos.items():
        db.add(
            PerpetuoAporte(
                perpetuo_id=perpetuo_id,
                dia=dia,
                valor=valor,
                descricao=DESCRICAO_META,
            )
        )
    await db.commit()

    return {
        "dias": len(gastos),
        "total": sum(gastos.values(), Decimal("0")),
        "periodo": [inicio.isoformat(), fim.isoformat()],
    }


async def sincronizar_meta_todos(db: AsyncSession, dias_retroativos: int = 3) -> dict:
    """Roda sincronizar_meta_perpetuo() pra todo perpétuo com Meta configurado.
    Usado pelo endpoint de cron."""
    stmt = select(Perpetuo).where(Perpetuo.meta_ad_account_id.is_not(None))
    perps = list((await db.execute(stmt)).scalars().all())
    resultados = []
    for p in perps:
        r = await sincronizar_meta_perpetuo(db, p.id, dias_retroativos)
        resultados.append({"perpetuo": p.nome, **r})
    return {"perpetuos_sincronizados": len(resultados), "detalhes": resultados}


# ============================================================
# Helpers para listar ofertas distintas (pra UI de "adicionar oferta")
# ============================================================
async def listar_ofertas_disponiveis(
    db: AsyncSession,
) -> list[tuple[str, str | None, str | None]]:
    """Retorna tuplas (oferta_codigo, oferta_nome, produto) distintas das
    vendas aprovadas — pra UI mostrar quais ofertas existem pra cadastrar
    no perpétuo."""
    stmt = (
        select(
            Venda.oferta_codigo,
            func.max(Venda.oferta_nome).label("oferta_nome"),
            func.max(Venda.produto).label("produto"),
        )
        .where(Venda.oferta_codigo.is_not(None), Venda.status == "aprovada")
        .group_by(Venda.oferta_codigo)
        .order_by(func.max(Venda.produto), func.max(Venda.oferta_nome))
    )
    rows = (await db.execute(stmt)).all()
    return [(r.oferta_codigo, r.oferta_nome, r.produto) for r in rows]
