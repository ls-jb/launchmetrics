"""Endpoints do Lançamento Pago. Leitura: qualquer logado. Cadastro: admin."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.auth import require_admin, verify_token
from app.schemas.lancamento_pago import (
    AjusteCreate,
    AjusteResponse,
    LancamentoPagoCompleto,
    LancamentoPagoCreate,
    LancamentoPagoResponse,
    LancamentoPagoUpdate,
    OfertaCreate,
    OfertaResponse,
)
from app.services import lancamento_pago_service as svc

router = APIRouter(prefix="/lancamentos-pagos", tags=["lancamentos-pagos"])


# ============================================================
# Leitura (qualquer logado)
# ============================================================
@router.get("", response_model=list[LancamentoPagoResponse])
async def listar(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    return await svc.listar(db)


@router.get("/{lancamento_id}", response_model=LancamentoPagoCompleto)
async def obter(
    lancamento_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    lanc = await svc.obter(db, lancamento_id)
    if not lanc:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado.")
    return lanc


# ============================================================
# Cadastro (admin)
# ============================================================
@router.post(
    "",
    response_model=LancamentoPagoResponse,
    status_code=status.HTTP_201_CREATED,
)
async def criar(
    dados: LancamentoPagoCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    return await svc.criar(db, dados.nome, dados.data_inicio, dados.data_abertura_carrinho)


@router.patch("/{lancamento_id}", response_model=LancamentoPagoResponse)
async def atualizar(
    lancamento_id: UUID,
    dados: LancamentoPagoUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    lanc = await svc.atualizar(
        db,
        lancamento_id,
        dados.nome,
        dados.data_inicio,
        dados.data_abertura_carrinho,
    )
    if not lanc:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado.")
    return lanc


@router.delete("/{lancamento_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover(
    lancamento_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    if not await svc.remover(db, lancamento_id):
        raise HTTPException(status_code=404, detail="Lançamento não encontrado.")


@router.post(
    "/{lancamento_id}/ofertas",
    response_model=OfertaResponse,
    status_code=status.HTTP_201_CREATED,
)
async def adicionar_oferta(
    lancamento_id: UUID,
    dados: OfertaCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    of = await svc.adicionar_oferta(
        db,
        lancamento_id,
        dados.produto,
        dados.oferta_nome,
        dados.oferta_codigo,
        dados.categoria,
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
    if not await svc.remover_oferta(db, oferta_id):
        raise HTTPException(status_code=404, detail="Oferta não encontrada.")


@router.post(
    "/ofertas/{oferta_id}/ajustes",
    response_model=AjusteResponse,
    status_code=status.HTTP_201_CREATED,
)
async def adicionar_ajuste(
    oferta_id: UUID,
    dados: AjusteCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Adiciona uma venda manual (apenas visual) à oferta — não toca em `vendas`."""
    aj = await svc.adicionar_ajuste(
        db, oferta_id, dados.quantidade, dados.valor, dados.descricao
    )
    if not aj:
        raise HTTPException(status_code=404, detail="Oferta não encontrada.")
    return aj


@router.delete("/ajustes/{ajuste_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_ajuste(
    ajuste_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    if not await svc.remover_ajuste(db, ajuste_id):
        raise HTTPException(status_code=404, detail="Ajuste não encontrado.")
