"""
Lógica de negócio dos lançamentos. CRUD e cálculo das métricas (CPL, ROAS, etc.).
Todos os cálculos ficam aqui — nunca no router e nunca no frontend.
"""
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import Date, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Canal, Lancamento, Lead
from app.schemas.lancamento import (
    CanalResponse,
    CanalUpdate,
    LancamentoCreate,
    LancamentoResponse,
    LancamentoUpdate,
    PontoVelocidade,
)
from app.services import lancamento_vendas_service, meta_ads_service
from app.services.lancamento_vendas_service import TotaisVendas

ZERO = Decimal("0")
STATUS_INICIAL = {"leads": "captacao", "vendas": "carrinho"}
"""Status com que o lançamento nasce, por tipo. Pode mudar depois via PATCH."""


# ============================================================
# Operações de leitura
# ============================================================
async def listar(db: AsyncSession) -> list[LancamentoResponse]:
    stmt = (
        select(Lancamento)
        .options(selectinload(Lancamento.canais))
        .order_by(Lancamento.criado_em.desc())
    )
    lancamentos = list((await db.execute(stmt)).scalars().all())
    leads_por_canal_global = await _leads_por_canal(db)
    vendas = await lancamento_vendas_service.totais_por_lancamento(db, lancamentos)
    return [
        _montar_response(l, leads_por_canal_global, vendas.get(l.id))
        for l in lancamentos
    ]


async def obter(db: AsyncSession, id: UUID) -> LancamentoResponse | None:
    stmt = (
        select(Lancamento)
        .options(selectinload(Lancamento.canais))
        .where(Lancamento.id == id)
    )
    lancamento = (await db.execute(stmt)).scalar_one_or_none()
    if not lancamento:
        return None
    leads_por_canal_global = await _leads_por_canal(db)
    vendas = await lancamento_vendas_service.totais_por_lancamento(db, [lancamento])
    return _montar_response(lancamento, leads_por_canal_global, vendas.get(lancamento.id))


async def leads_por_utm_content(
    db: AsyncSession, lancamento_id: UUID, canal_id: UUID
) -> list:
    """Drill-down: quantos leads em cada utm_content dentro de um canal.
    Leads sem utm_content viram bucket "Sem utm_content"."""
    from app.schemas.lancamento import LeadsPorUtmContent

    utm = func.coalesce(
        func.nullif(func.trim(Lead.utm_content), ""), "Sem utm_content"
    ).label("utm")
    stmt = (
        select(utm, func.count(Lead.id).label("qtd"))
        .where(Lead.lancamento_id == lancamento_id, Lead.canal_id == canal_id)
        .group_by(utm)
        .order_by(func.count(Lead.id).desc())
    )
    rows = (await db.execute(stmt)).all()
    return [LeadsPorUtmContent(utm_content=r.utm, quantidade=r.qtd) for r in rows]


async def velocidade_leads(
    db: AsyncSession, lancamento_id: UUID
) -> list[PontoVelocidade]:
    """Leads agregados por dia (horário de Brasília) — alimenta o gráfico
    de linha do detalhe. Sem o AT TIME ZONE, o Postgres agrupa em UTC e
    leads das 21h-23h59 BRT acabam no "dia seguinte"."""
    dia = cast(
        func.timezone("America/Sao_Paulo", Lead.criado_em), Date
    ).label("dia")
    stmt = (
        select(dia, func.count(Lead.id).label("leads"))
        .where(Lead.lancamento_id == lancamento_id)
        .group_by(dia)
        .order_by(dia)
    )
    rows = (await db.execute(stmt)).all()
    return [PontoVelocidade(dia=r.dia, leads=r.leads) for r in rows]


# ============================================================
# Operações de escrita
# ============================================================
async def criar(db: AsyncSession, dados: LancamentoCreate) -> LancamentoResponse:
    # status começa em 'captacao' no dash de leads (mais comum quando se
    # cadastra) e em 'carrinho' no de vendas. Pode mudar depois via PATCH.
    campos = dados.model_dump()
    campos["investimento_manual"] = campos["investimento_manual"] or ZERO
    lancamento = Lancamento(
        **campos, status=STATUS_INICIAL[dados.tipo], webhook_token=uuid4().hex
    )
    db.add(lancamento)
    await db.commit()
    await db.refresh(lancamento, attribute_names=["canais"])
    return _montar_response(lancamento, {})


async def atualizar(
    db: AsyncSession, id: UUID, dados: LancamentoUpdate
) -> LancamentoResponse | None:
    lancamento = await _buscar_simples(db, id)
    if not lancamento:
        return None

    for chave, valor in dados.model_dump(exclude_unset=True).items():
        # investimento apagado na tela chega como null — a coluna não aceita.
        if chave == "investimento_manual" and valor is None:
            valor = ZERO
        setattr(lancamento, chave, valor)

    await db.commit()
    return await obter(db, id)


async def deletar(db: AsyncSession, id: UUID) -> bool:
    lancamento = await _buscar_simples(db, id)
    if not lancamento:
        return False
    await db.delete(lancamento)
    await db.commit()
    return True


async def atualizar_canais(
    db: AsyncSession, lancamento_id: UUID, atualizacoes: list[CanalUpdate]
) -> LancamentoResponse | None:
    lancamento = await _buscar_simples(db, lancamento_id)
    if not lancamento:
        return None

    ids_para_atualizar = {a.id for a in atualizacoes}
    stmt = select(Canal).where(
        Canal.lancamento_id == lancamento_id,
        Canal.id.in_(ids_para_atualizar),
    )
    canais = {c.id: c for c in (await db.execute(stmt)).scalars().all()}

    for atu in atualizacoes:
        canal = canais.get(atu.id)
        if canal:
            canal.investimento = atu.investimento

    await db.commit()
    return await obter(db, lancamento_id)


# ============================================================
# Helpers privados
# ============================================================
async def _buscar_simples(db: AsyncSession, id: UUID) -> Lancamento | None:
    """Busca o Lancamento sem eager-load de canais — para updates simples."""
    stmt = select(Lancamento).where(Lancamento.id == id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def _leads_por_canal(db: AsyncSession) -> dict[UUID, int]:
    """Retorna um mapa canal_id -> quantidade de leads. Uma única query."""
    stmt = (
        select(Lead.canal_id, func.count(Lead.id))
        .where(Lead.canal_id.is_not(None))
        .group_by(Lead.canal_id)
    )
    return {canal_id: total for canal_id, total in (await db.execute(stmt)).all()}


def calcular_metricas(
    tipo: str,
    investimento_canais: Decimal,
    investimento_manual: Decimal,
    total_leads: int,
    vendas: TotaisVendas | None,
) -> dict[str, Decimal | int]:
    """Métricas do lançamento (CPL, ROAS, ticket médio). No dash de vendas
    o investimento é o digitado à mão e a receita vem das ofertas
    vinculadas; no de leads o investimento é a soma dos canais."""
    eh_vendas = tipo == "vendas"
    investimento = investimento_manual if eh_vendas else investimento_canais
    # TODO etapa 5: no dash de leads, somar vendas no período do lançamento
    receita = vendas.receita if (eh_vendas and vendas) else ZERO
    total_vendas = vendas.quantidade if (eh_vendas and vendas) else 0
    return {
        "investimento_total": investimento,
        "receita_total": receita,
        "total_vendas": total_vendas,
        "cpl": (investimento / total_leads) if total_leads > 0 else ZERO,
        "roas": (receita / investimento) if investimento > 0 else ZERO,
        "ticket_medio": (receita / total_vendas) if total_vendas > 0 else ZERO,
    }


def _canais_response(
    lancamento: Lancamento, leads_por_canal: dict[UUID, int]
) -> list[CanalResponse]:
    canais_resp = [
        CanalResponse(
            id=c.id,
            nome=c.nome,
            investimento=c.investimento,
            leads=leads_por_canal.get(c.id, 0),
        )
        for c in lancamento.canais
    ]
    # Quem trouxe mais leads aparece em cima — vale pro BarraCanal e pro
    # EditorInvestimento, que consomem a mesma lista. Empate: nome A→Z.
    canais_resp.sort(key=lambda c: (-c.leads, c.nome.lower()))
    return canais_resp


def _montar_response(
    lancamento: Lancamento,
    leads_por_canal: dict[UUID, int],
    vendas: TotaisVendas | None = None,
) -> LancamentoResponse:
    canais_resp = _canais_response(lancamento, leads_por_canal)
    total_leads = sum(c.leads for c in canais_resp)
    metricas = calcular_metricas(
        tipo=lancamento.tipo,
        investimento_canais=sum((c.investimento for c in lancamento.canais), ZERO),
        investimento_manual=lancamento.investimento_manual or ZERO,
        total_leads=total_leads,
        vendas=vendas,
    )

    return LancamentoResponse(
        id=lancamento.id,
        nome=lancamento.nome,
        tipo=lancamento.tipo,  # type: ignore[arg-type]
        pasta_id=lancamento.pasta_id,
        investimento_manual=lancamento.investimento_manual or ZERO,
        status=lancamento.status,  # type: ignore[arg-type]
        data_inicio=lancamento.data_inicio,
        data_fim=lancamento.data_fim,
        meta_leads=lancamento.meta_leads,
        teto_investimento=lancamento.teto_investimento,
        meta_roas=lancamento.meta_roas,
        meta_receita=lancamento.meta_receita,
        meta_ad_account_id=lancamento.meta_ad_account_id,
        meta_filtro_nome=lancamento.meta_filtro_nome,
        meta_contas_extras=lancamento.meta_contas_extras,  # type: ignore[arg-type]
        sendflow_release_id=lancamento.sendflow_release_id,
        webhook_token=lancamento.webhook_token,
        criado_em=lancamento.criado_em,
        total_leads=total_leads,
        canais=canais_resp,
        **metricas,  # type: ignore[arg-type]
    )


# ============================================================
# Sincronização Meta Ads — atualiza o canal "Meta Ads"
# ============================================================
META_ADS_CANAL_NOME = "Meta Ads"


async def sincronizar_meta(db: AsyncSession, lancamento_id: UUID) -> dict:
    """Puxa o gasto Meta Ads no período do lançamento e sobrescreve o
    `investimento` do canal "Meta Ads" (cria se não existir).
    Janela: [data_inicio, data_fim]. Filtra campanhas pelo
    meta_filtro_nome (substring).

    Quando o lançamento tem `meta_contas_extras` populado (ex: trocou
    de ad account no meio do tráfego), soma o gasto do par principal
    + de todos os pares extras. Cada par (ad_account, filtro) puxa
    independente; qualquer par que falhar (token, permissão) devolve
    0 daquele par mas os outros seguem — meta_ads_service já engole.

    No-op se nenhum par válido ou datas faltando."""
    lanc = await _buscar_simples(db, lancamento_id)
    if not lanc:
        return {"investimento": Decimal("0"), "periodo": None, "atualizado": False}
    if not lanc.data_inicio or not lanc.data_fim:
        return {"investimento": Decimal("0"), "periodo": None, "atualizado": False}

    # Monta a lista de pares (principal + extras). Ignora entradas sem
    # ad_account_id (defensivo — não deveria chegar assim do JSONB).
    pares: list[tuple[str, str | None]] = []
    if lanc.meta_ad_account_id:
        pares.append((lanc.meta_ad_account_id, lanc.meta_filtro_nome))
    for extra in (lanc.meta_contas_extras or []):
        ad = (extra.get("ad_account_id") or "").strip() if isinstance(extra, dict) else ""
        if not ad:
            continue
        filtro = extra.get("filtro_nome") if isinstance(extra, dict) else None
        pares.append((ad, filtro))

    if not pares:
        return {"investimento": Decimal("0"), "periodo": None, "atualizado": False}

    total = Decimal("0")
    for ad_id, filtro in pares:
        gastos = await meta_ads_service.puxar_gasto_por_dia(
            ad_id, lanc.data_inicio, lanc.data_fim, filtro,
        )
        if gastos:
            total += sum(gastos.values(), Decimal("0"))

    # Garante o canal "Meta Ads" e atualiza o investimento (sobrescreve)
    canal = (
        await db.execute(
            select(Canal).where(
                Canal.lancamento_id == lancamento_id,
                Canal.nome == META_ADS_CANAL_NOME,
            )
        )
    ).scalar_one_or_none()
    if canal is None:
        canal = Canal(
            lancamento_id=lancamento_id,
            nome=META_ADS_CANAL_NOME,
            investimento=total,
        )
        db.add(canal)
    else:
        canal.investimento = total

    await db.commit()

    return {
        "investimento": total,
        "periodo": [lanc.data_inicio.isoformat(), lanc.data_fim.isoformat()],
        "atualizado": True,
    }


async def sincronizar_meta_todos(db: AsyncSession) -> dict:
    """Roda sincronizar_meta() pra cada lançamento com Meta configurado
    (principal OU extras). Usado pelo cron diário."""
    stmt = select(Lancamento).where(
        or_(
            Lancamento.meta_ad_account_id.is_not(None),
            Lancamento.meta_contas_extras.is_not(None),
        )
    )
    lancs = list((await db.execute(stmt)).scalars().all())
    resultados = []
    for l in lancs:
        r = await sincronizar_meta(db, l.id)
        resultados.append({"lancamento": l.nome, **r})
    return {"lancamentos_sincronizados": len(resultados), "detalhes": resultados}
