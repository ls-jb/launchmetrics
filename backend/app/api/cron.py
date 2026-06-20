"""
Endpoints de cron (chamados pelo Vercel scheduled functions).

O Vercel manda GET com Authorization: Bearer ${CRON_SECRET} quando essa
env está cadastrada no projeto. Validamos contra o env CRON_SECRET local.

Schedule está em vercel.json — hoje só roda /api/cron/sync-meta às 3h BRT.
"""
import logging
import os

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services import lancamento_pago_service, perpetuo_service

router = APIRouter(prefix="/cron", tags=["cron"])
logger = logging.getLogger(__name__)


def _checar_secret(authorization: str | None) -> None:
    """Compara o header Authorization com a env CRON_SECRET. Levanta 403
    se não bater. Vercel manda automaticamente quando CRON_SECRET existe."""
    esperado = (os.getenv("CRON_SECRET") or "").strip()
    if not esperado:
        raise HTTPException(status_code=503, detail="CRON_SECRET não configurado")
    if authorization != f"Bearer {esperado}":
        raise HTTPException(status_code=403, detail="cron secret inválido")


@router.get("/sync-meta")
async def sync_meta(
    authorization: str | None = Header(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Sincroniza TODOS os perpétuos e lançamentos pagos com Meta Ads
    configurado. Roda em sequência (não paralelo) pra não rate-limitar a
    Meta API. Cada um falha silenciosamente — o cron não para se 1 cair."""
    _checar_secret(authorization)

    perp = await perpetuo_service.sincronizar_meta_todos(db, dias_retroativos=3)
    lp = await lancamento_pago_service.sincronizar_meta_todos(db)

    return {"perpetuos": perp, "lancamentos_pagos": lp}
