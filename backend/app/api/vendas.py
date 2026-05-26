from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.auth import verify_token
from app.schemas.venda import (
    PontoReceita,
    ProdutoRanking,
    ResumoVendas,
    VendaResponse,
)
from app.services import vendas_service

router = APIRouter(prefix="/vendas", tags=["vendas"])


@router.get("", response_model=list[VendaResponse])
async def listar_vendas(
    inicio: date = Query(..., description="Data inicial (YYYY-MM-DD)"),
    fim: date = Query(..., description="Data final (YYYY-MM-DD)"),
    produto: str | None = Query(default=None),
    oferta: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    return await vendas_service.listar(db, inicio, fim, produto, oferta, limit, offset)


@router.get("/resumo", response_model=ResumoVendas)
async def resumo_vendas(
    inicio: date = Query(...),
    fim: date = Query(...),
    produto: str | None = Query(default=None),
    oferta: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    return await vendas_service.resumo(db, inicio, fim, produto, oferta)


@router.get("/por-dia", response_model=list[PontoReceita])
async def vendas_por_dia(
    inicio: date = Query(...),
    fim: date = Query(...),
    produto: str | None = Query(default=None),
    oferta: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    return await vendas_service.por_dia(db, inicio, fim, produto, oferta)


@router.get("/por-produto", response_model=list[ProdutoRanking])
async def vendas_por_produto(
    inicio: date = Query(...),
    fim: date = Query(...),
    produto: str | None = Query(default=None),
    oferta: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    return await vendas_service.por_produto(db, inicio, fim, produto, oferta)


@router.get("/produtos", response_model=list[str])
async def listar_produtos(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    return await vendas_service.produtos_distintos(db)
