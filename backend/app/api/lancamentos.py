from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.auth import verify_token
from app.schemas.lancamento import (
    CanalUpdate,
    LancamentoCreate,
    LancamentoResponse,
    LancamentoUpdate,
    LeadsPorUtmContent,
    PontoVelocidade,
    SendflowLeadsResponse,
)
from app.services import lancamento_service, sendflow_service

router = APIRouter(prefix="/lancamentos", tags=["lancamentos"])


@router.get("", response_model=list[LancamentoResponse])
async def listar_lancamentos(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    return await lancamento_service.listar(db)


@router.post("", response_model=LancamentoResponse, status_code=status.HTTP_201_CREATED)
async def criar_lancamento(
    dados: LancamentoCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    return await lancamento_service.criar(db, dados)


@router.get("/{id}", response_model=LancamentoResponse)
async def obter_lancamento(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    lancamento = await lancamento_service.obter(db, id)
    if not lancamento:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado")
    return lancamento


@router.get("/{id}/velocidade-leads", response_model=list[PontoVelocidade])
async def velocidade_leads_lancamento(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    return await lancamento_service.velocidade_leads(db, id)


@router.patch("/{id}", response_model=LancamentoResponse)
async def atualizar_lancamento(
    id: UUID,
    dados: LancamentoUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    lancamento = await lancamento_service.atualizar(db, id, dados)
    if not lancamento:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado")
    return lancamento


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def deletar_lancamento(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    sucesso = await lancamento_service.deletar(db, id)
    if not sucesso:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado")


@router.get(
    "/{id}/canais/{canal_id}/utm-content",
    response_model=list[LeadsPorUtmContent],
)
async def leads_por_utm_content(
    id: UUID,
    canal_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    """Drill-down: leads agrupados por utm_content dentro do canal."""
    return await lancamento_service.leads_por_utm_content(db, id, canal_id)


@router.patch("/{id}/canais", response_model=LancamentoResponse)
async def atualizar_canais_lancamento(
    id: UUID,
    atualizacoes: list[CanalUpdate],
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    lancamento = await lancamento_service.atualizar_canais(db, id, atualizacoes)
    if not lancamento:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado")
    return lancamento


@router.post("/{id}/sync-meta")
async def sync_meta(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    """Puxa gasto Meta Ads no período [data_inicio, data_fim] e atualiza
    o canal 'Meta Ads' do lançamento (cria se não existir)."""
    if not await lancamento_service.obter(db, id):
        raise HTTPException(status_code=404, detail="Lançamento não encontrado.")
    return await lancamento_service.sincronizar_meta(db, id)


@router.get("/{id}/sendflow-leads", response_model=SendflowLeadsResponse)
async def sendflow_leads(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    """Puxa on-demand o total de participantes dos grupos WhatsApp da
    campanha SendFlow vinculada ao lançamento. Retorna zerado se o
    lançamento não tem release vinculado ou se a API do SendFlow
    falhar."""
    from app.models import Lancamento

    lanc = await db.get(Lancamento, id)
    if not lanc:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado.")
    if not lanc.sendflow_release_id:
        return SendflowLeadsResponse(total=0, grupos_count=0, release_id="")
    return SendflowLeadsResponse(
        **(await sendflow_service.leads_no_grupo(lanc.sendflow_release_id))
    )


@router.get("/{id}/sendflow-debug")
async def sendflow_debug(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    """Diagnóstico do SendFlow — não expõe o token, retorna: token
    presente sim/não, URL chamada, status HTTP e primeiros 300 chars da
    resposta. Pra distinguir 'token ausente' x 'release_id vazio' x
    'API errada'."""
    from app.models import Lancamento

    lanc = await db.get(Lancamento, id)
    if not lanc:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado.")
    return await sendflow_service.diagnostico(lanc.sendflow_release_id)
