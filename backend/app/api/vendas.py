from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.auth import verify_token
from app.schemas.venda import (
    OfertaBreakdown,
    OfertaPrecoResponse,
    OfertaPrecoUpsert,
    PontoReceita,
    ProdutoRanking,
    ResumoVendas,
    VendaManualCreate,
    VendaResponse,
)
from app.services import vendas_service

router = APIRouter(prefix="/vendas", tags=["vendas"])


@router.post("", response_model=VendaResponse, status_code=status.HTTP_201_CREATED)
async def cadastrar_venda_manual(
    dados: VendaManualCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    """
    Cadastra manualmente uma venda (PIX direto, venda avulsa).
    Plataforma fica como 'Manual' automaticamente.
    """
    return await vendas_service.criar_manual(db, dados)


@router.get("", response_model=list[VendaResponse])
async def listar_vendas(
    inicio: date = Query(..., description="Data inicial (YYYY-MM-DD)"),
    fim: date = Query(..., description="Data final (YYYY-MM-DD)"),
    produtos: list[str] | None = Query(default=None),
    oferta: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    return await vendas_service.listar(db, inicio, fim, produtos, oferta, limit, offset)


@router.get("/resumo", response_model=ResumoVendas)
async def resumo_vendas(
    inicio: date = Query(...),
    fim: date = Query(...),
    produtos: list[str] | None = Query(default=None),
    oferta: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    return await vendas_service.resumo(db, inicio, fim, produtos, oferta)


@router.get("/por-dia", response_model=list[PontoReceita])
async def vendas_por_dia(
    inicio: date = Query(...),
    fim: date = Query(...),
    produtos: list[str] | None = Query(default=None),
    oferta: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    return await vendas_service.por_dia(db, inicio, fim, produtos, oferta)


@router.get("/por-produto", response_model=list[ProdutoRanking])
async def vendas_por_produto(
    inicio: date = Query(...),
    fim: date = Query(...),
    produtos: list[str] | None = Query(default=None),
    oferta: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    return await vendas_service.por_produto(db, inicio, fim, produtos, oferta)


@router.get("/produtos", response_model=list[str])
async def listar_produtos(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    return await vendas_service.produtos_distintos(db)


@router.get("/ofertas", response_model=list[OfertaBreakdown])
async def ofertas_do_produto(
    produto: str = Query(..., description="Nome exato do produto"),
    inicio: date = Query(...),
    fim: date = Query(...),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    """Detalha as ofertas de um produto (popup do ranking)."""
    return await vendas_service.ofertas_por_produto(db, produto, inicio, fim)


@router.put("/ofertas/preco", response_model=OfertaPrecoResponse)
async def definir_preco_oferta(
    dados: OfertaPrecoUpsert,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    """
    Cadastra/atualiza o valor à vista de uma oferta. Usado quando o webhook
    não traz o valor real (ex: boleto parcelado Hotmart). Aplica a todas as
    vendas dessa oferta no dashboard (passadas e futuras).
    """
    return await vendas_service.upsert_preco_oferta(db, dados)


@router.delete("/ofertas/preco/{oferta_codigo}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_preco_oferta(
    oferta_codigo: str,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    """Remove o override — a oferta volta a usar o valor da transação."""
    await vendas_service.remover_preco_oferta(db, oferta_codigo)
