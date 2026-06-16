"""Endpoints dos Perpétuos. Leitura: qualquer logado. Escrita: admin."""
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.auth import require_admin, verify_token
from app.schemas.perpetuo import (
    AporteCreate,
    AporteResponse,
    PerpetuoCompleto,
    PerpetuoCreate,
    PerpetuoProdutoResponse,
    PerpetuoResponse,
    PerpetuoUpdate,
    PontoVendaProduto,
    ProdutoCreate,
)
from app.services import perpetuo_service as svc

router = APIRouter(prefix="/perpetuos", tags=["perpetuos"])


# ============================================================
# Leitura
# ============================================================
@router.get("", response_model=list[PerpetuoResponse])
async def listar(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    return await svc.listar(db)


@router.get("/{perpetuo_id}", response_model=PerpetuoCompleto)
async def obter(
    perpetuo_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    perp = await svc.obter(db, perpetuo_id)
    if not perp:
        raise HTTPException(status_code=404, detail="Perpétuo não encontrado.")
    return perp


@router.get(
    "/{perpetuo_id}/vendas-por-dia", response_model=list[PontoVendaProduto]
)
async def vendas_por_dia(
    perpetuo_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    """Pontos diários por produto pro gráfico com checkboxes."""
    return await svc.vendas_por_dia_produto(db, perpetuo_id)


# ============================================================
# Escrita (admin)
# ============================================================
@router.post(
    "", response_model=PerpetuoResponse, status_code=status.HTTP_201_CREATED
)
async def criar(
    dados: PerpetuoCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    return await svc.criar(
        db,
        dados.nome,
        dados.data_inicio,
        Decimal(str(dados.investimento or 0)),
        dados.produtos,
    )


@router.patch("/{perpetuo_id}", response_model=PerpetuoResponse)
async def atualizar(
    perpetuo_id: UUID,
    dados: PerpetuoUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    invest = Decimal(str(dados.investimento)) if dados.investimento is not None else None
    perp = await svc.atualizar(
        db, perpetuo_id, dados.nome, dados.data_inicio, invest
    )
    if not perp:
        raise HTTPException(status_code=404, detail="Perpétuo não encontrado.")
    return perp


@router.delete("/{perpetuo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover(
    perpetuo_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    if not await svc.remover(db, perpetuo_id):
        raise HTTPException(status_code=404, detail="Perpétuo não encontrado.")


@router.post(
    "/{perpetuo_id}/produtos",
    response_model=PerpetuoProdutoResponse,
    status_code=status.HTTP_201_CREATED,
)
async def adicionar_produto(
    perpetuo_id: UUID,
    dados: ProdutoCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    item = await svc.adicionar_produto(db, perpetuo_id, dados.produto)
    if not item:
        raise HTTPException(status_code=404, detail="Perpétuo não encontrado.")
    return item


@router.delete(
    "/produtos/{produto_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remover_produto(
    produto_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    if not await svc.remover_produto(db, produto_id):
        raise HTTPException(status_code=404, detail="Produto não encontrado.")


# ============================================================
# Aportes (histórico de investimento por dia)
# ============================================================
@router.post(
    "/{perpetuo_id}/aportes",
    response_model=AporteResponse,
    status_code=status.HTTP_201_CREATED,
)
async def adicionar_aporte(
    perpetuo_id: UUID,
    dados: AporteCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    aporte = await svc.adicionar_aporte(
        db,
        perpetuo_id,
        dados.dia,
        Decimal(str(dados.valor)),
        dados.descricao,
    )
    if not aporte:
        raise HTTPException(status_code=404, detail="Perpétuo não encontrado.")
    return aporte


@router.delete(
    "/aportes/{aporte_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remover_aporte(
    aporte_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    if not await svc.remover_aporte(db, aporte_id):
        raise HTTPException(status_code=404, detail="Aporte não encontrado.")
