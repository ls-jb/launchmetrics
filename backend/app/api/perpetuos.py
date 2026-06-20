"""Endpoints dos Perpétuos. Leitura: qualquer logado. Escrita: admin."""
from datetime import date
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.auth import require_admin, verify_token
from app.schemas.perpetuo import (
    AporteCreate,
    AporteResponse,
    OfertaCreate,
    PerpetuoCompleto,
    PerpetuoCreate,
    PerpetuoOfertaResponse,
    PerpetuoResponse,
    PerpetuoUpdate,
    PontoInvestimentoDia,
    PontoVendaCategoria,
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
    inicio: date | None = Query(default=None),
    fim: date | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    perp = await svc.obter(db, perpetuo_id, inicio, fim)
    if not perp:
        raise HTTPException(status_code=404, detail="Perpétuo não encontrado.")
    return perp


@router.get(
    "/{perpetuo_id}/vendas-por-dia", response_model=list[PontoVendaCategoria]
)
async def vendas_por_dia(
    perpetuo_id: UUID,
    inicio: date | None = Query(default=None),
    fim: date | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    """Pontos diários por categoria (Principal / Order Bump / Upsell /
    Downsell / Outros) pro gráfico — filtrado pelo período."""
    return await svc.vendas_por_dia_categoria(db, perpetuo_id, inicio, fim)


@router.get(
    "/{perpetuo_id}/investimento-por-dia",
    response_model=list[PontoInvestimentoDia],
)
async def investimento_por_dia(
    perpetuo_id: UUID,
    inicio: date | None = Query(default=None),
    fim: date | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    """Soma dos aportes por dia no período — pra barra sobreposta no gráfico."""
    return await svc.investimento_por_dia(db, perpetuo_id, inicio, fim)


@router.get(
    "/_meta/ofertas-disponiveis",
    response_model=list[dict],
)
async def listar_ofertas_disponiveis(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    """Retorna ofertas distintas das vendas aprovadas pra UI escolher
    quais cadastrar no perpétuo. Formato: [{oferta_codigo, oferta_nome,
    produto}]. O prefixo _meta evita conflito com a rota /{perpetuo_id}."""
    rows = await svc.listar_ofertas_disponiveis(db)
    return [
        {"oferta_codigo": c, "oferta_nome": n, "produto": p} for c, n, p in rows
    ]


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
        [],
    )


@router.patch("/{perpetuo_id}", response_model=PerpetuoResponse)
async def atualizar(
    perpetuo_id: UUID,
    dados: PerpetuoUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    invest = (
        Decimal(str(dados.investimento)) if dados.investimento is not None else None
    )
    atualiza_meta = "meta_ad_account_id" in dados.model_fields_set or (
        "meta_filtro_nome" in dados.model_fields_set
    )
    perp = await svc.atualizar(
        db,
        perpetuo_id,
        dados.nome,
        dados.data_inicio,
        invest,
        dados.meta_ad_account_id,
        dados.meta_filtro_nome,
        atualizar_meta=atualiza_meta,
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


# ============================================================
# Ofertas
# ============================================================
@router.post(
    "/{perpetuo_id}/ofertas",
    response_model=PerpetuoOfertaResponse,
    status_code=status.HTTP_201_CREATED,
)
async def adicionar_oferta(
    perpetuo_id: UUID,
    dados: OfertaCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    item = await svc.adicionar_oferta(
        db, perpetuo_id, dados.oferta_codigo, dados.oferta_nome
    )
    if not item:
        raise HTTPException(status_code=404, detail="Perpétuo não encontrado.")
    return item


@router.delete(
    "/ofertas/{oferta_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def remover_oferta(
    oferta_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    if not await svc.remover_oferta(db, oferta_id):
        raise HTTPException(status_code=404, detail="Oferta não encontrada.")


# ============================================================
# Aportes (histórico de investimento)
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


# ============================================================
# Sincronização Meta Ads
# ============================================================
@router.post("/{perpetuo_id}/sync-meta")
async def sync_meta_perpetuo(
    perpetuo_id: UUID,
    dias: int = Query(default=3, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    """Puxa o gasto Meta Ads dos últimos N dias pra esse perpétuo e faz
    UPSERT em perpetuos_aportes (preserva aportes manuais). Exige Meta
    configurado (meta_ad_account_id setado)."""
    if not await svc.obter(db, perpetuo_id):
        raise HTTPException(status_code=404, detail="Perpétuo não encontrado.")
    return await svc.sincronizar_meta_perpetuo(db, perpetuo_id, dias)


