"""Pastas da aba Lançamentos — juntam os dashboards do mesmo lançamento."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.auth import verify_token
from app.schemas.lancamento_vendas import PastaResponse, PastaSalvar
from app.services import pasta_service

router = APIRouter(prefix="/pastas", tags=["pastas"])


@router.get("", response_model=list[PastaResponse])
async def listar_pastas(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    return await pasta_service.listar(db)


@router.post("", response_model=PastaResponse, status_code=status.HTTP_201_CREATED)
async def criar_pasta(
    dados: PastaSalvar,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    return await pasta_service.criar(db, dados.nome)


@router.patch("/{id}", response_model=PastaResponse)
async def renomear_pasta(
    id: UUID,
    dados: PastaSalvar,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    pasta = await pasta_service.renomear(db, id, dados.nome)
    if not pasta:
        raise HTTPException(status_code=404, detail="Pasta não encontrada")
    return pasta


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_pasta(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    """Apaga só a pasta — os dashboards de dentro continuam, soltos."""
    if not await pasta_service.remover(db, id):
        raise HTTPException(status_code=404, detail="Pasta não encontrada")
