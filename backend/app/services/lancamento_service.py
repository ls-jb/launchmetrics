"""
Lógica de negócio dos lançamentos. CRUD e cálculo das métricas (CPL, ROAS, etc.).
Todos os cálculos ficam aqui — nunca no router e nunca no frontend.
"""
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import Date, cast, func, select
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

ZERO = Decimal("0")


# ============================================================
# Operações de leitura
# ============================================================
async def listar(db: AsyncSession) -> list[LancamentoResponse]:
    stmt = (
        select(Lancamento)
        .options(selectinload(Lancamento.canais))
        .order_by(Lancamento.criado_em.desc())
    )
    lancamentos = (await db.execute(stmt)).scalars().all()
    leads_por_canal_global = await _leads_por_canal(db)
    return [_montar_response(l, leads_por_canal_global) for l in lancamentos]


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
    return _montar_response(lancamento, leads_por_canal_global)


async def velocidade_leads(
    db: AsyncSession, lancamento_id: UUID
) -> list[PontoVelocidade]:
    """Leads agregados por dia — alimenta o gráfico de linha do detalhe."""
    dia = cast(Lead.criado_em, Date).label("dia")
    stmt = (
        select(dia, func.count(Lead.id).label("leads"))
        .where(Lead.lancamento_id == lancamento_id)
        .group_by(dia)
        .order_by(dia)
    )
    rows = (await db.execute(stmt)).all()
    return [PontoVelocidade(dia=r.dia, leads=r.leads) for r in rows]


async def velocidade_leads(
    db: AsyncSession, lancamento_id: UUID
) -> list[PontoVelocidade]:
    """Leads agregados por dia — alimenta o gráfico de linha do detalhe."""
    dia = cast(Lead.criado_em, Date).label("dia")
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
    lancamento = Lancamento(**dados.model_dump(), webhook_token=uuid4().hex)
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


def _montar_response(
    lancamento: Lancamento, leads_por_canal: dict[UUID, int]
) -> LancamentoResponse:
    canais_resp = [
        CanalResponse(
            id=c.id,
            nome=c.nome,
            investimento=c.investimento,
            leads=leads_por_canal.get(c.id, 0),
        )
        for c in lancamento.canais
    ]
    total_leads = sum(c.leads for c in canais_resp)
    investimento_total = sum((c.investimento for c in lancamento.canais), ZERO)
    receita_total = ZERO  # TODO etapa 5: somar vendas no período do lançamento

    cpl = (investimento_total / total_leads) if total_leads > 0 else ZERO
    roas = (receita_total / investimento_total) if investimento_total > 0 else ZERO

    return LancamentoResponse(
        id=lancamento.id,
        nome=lancamento.nome,
        status=lancamento.status,  # type: ignore[arg-type]
        data_inicio=lancamento.data_inicio,
        data_fim=lancamento.data_fim,
        meta_leads=lancamento.meta_leads,
        meta_roas=lancamento.meta_roas,
        meta_receita=lancamento.meta_receita,
        webhook_token=lancamento.webhook_token,
        criado_em=lancamento.criado_em,
        total_leads=total_leads,
        investimento_total=investimento_total,
        receita_total=receita_total,
        cpl=cpl,
        roas=roas,
        canais=canais_resp,
    )
