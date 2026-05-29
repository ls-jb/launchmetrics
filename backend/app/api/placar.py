"""
Endpoints do placar de líderes.

- Cadastro (lançamento/ofertas/vendedores) = require_admin.
- Leitura e marcação = qualquer usuário logado (placar compartilhado).
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.auth import require_admin, verify_token
from app.schemas.placar import (
    LancamentoCreate,
    LancamentoResponse,
    LancamentoUpdate,
    MarcacaoRequest,
    MarcacaoResponse,
    OfertaCreate,
    OfertaResponse,
    PlacarCompleto,
    VendedorCreate,
    VendedorResponse,
)
from app.services import placar_service

router = APIRouter(prefix="/placar", tags=["placar"])


# ============================================================
# Leitura (qualquer logado)
# ============================================================
@router.get("/lancamentos", response_model=list[LancamentoResponse])
async def listar_lancamentos(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    return await placar_service.listar_lancamentos(db)


@router.get("/lancamentos/{lancamento_id}", response_model=PlacarCompleto)
async def obter_placar(
    lancamento_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    placar = await placar_service.obter_placar(db, lancamento_id)
    if not placar:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado.")
    return placar


@router.post("/marcar", response_model=MarcacaoResponse)
async def marcar(
    dados: MarcacaoRequest,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    if dados.delta not in (-1, 1):
        raise HTTPException(status_code=400, detail="delta deve ser +1 ou -1.")
    qtd = await placar_service.marcar(db, dados.vendedor_id, dados.oferta_id, dados.delta)
    return MarcacaoResponse(
        vendedor_id=dados.vendedor_id, oferta_id=dados.oferta_id, quantidade=qtd
    )


# ============================================================
# Cadastro (admin)
# ============================================================
@router.post(
    "/lancamentos",
    response_model=LancamentoResponse,
    status_code=status.HTTP_201_CREATED,
)
async def criar_lancamento(
    dados: LancamentoCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    return await placar_service.criar_lancamento(db, dados.nome)


@router.patch("/lancamentos/{lancamento_id}", response_model=LancamentoResponse)
async def atualizar_lancamento(
    lancamento_id: UUID,
    dados: LancamentoUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    lanc = await placar_service.atualizar_lancamento(
        db, lancamento_id, dados.nome, dados.ativo
    )
    if not lanc:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado.")
    return lanc


@router.delete("/lancamentos/{lancamento_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_lancamento(
    lancamento_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    if not await placar_service.remover_lancamento(db, lancamento_id):
        raise HTTPException(status_code=404, detail="Lançamento não encontrado.")


@router.post(
    "/lancamentos/{lancamento_id}/ofertas",
    response_model=OfertaResponse,
    status_code=status.HTTP_201_CREATED,
)
async def adicionar_oferta(
    lancamento_id: UUID,
    dados: OfertaCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    of = await placar_service.adicionar_oferta(
        db, lancamento_id, dados.produto, dados.oferta, dados.valor
    )
    if not of:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado.")
    return of


@router.delete("/ofertas/{oferta_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_oferta(
    oferta_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    if not await placar_service.remover_oferta(db, oferta_id):
        raise HTTPException(status_code=404, detail="Oferta não encontrada.")


@router.post(
    "/lancamentos/{lancamento_id}/vendedores",
    response_model=VendedorResponse,
    status_code=status.HTTP_201_CREATED,
)
async def adicionar_vendedor(
    lancamento_id: UUID,
    dados: VendedorCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    v = await placar_service.adicionar_vendedor(db, lancamento_id, dados.nome)
    if not v:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado.")
    return v


@router.delete("/vendedores/{vendedor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_vendedor(
    vendedor_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    if not await placar_service.remover_vendedor(db, vendedor_id):
        raise HTTPException(status_code=404, detail="Vendedor não encontrado.")
