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
)
from app.services import lancamento_service

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
