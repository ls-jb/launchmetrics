"""
Endpoint do webhook do Go High Level. SEM autenticação JWT — o token na URL
identifica o lançamento. SEMPRE retorna 200 (o GHL não faz retry corretamente
em códigos de erro).
"""
import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.services import webhook_service

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

logger = logging.getLogger(__name__)


@router.post("/ghl/{token}")
async def receber_lead_ghl(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Recebe leads do Go High Level via webhook.

    Não exige autenticação JWT — o token na URL identifica o lançamento.
    DEVE retornar 200 imediatamente — GHL marca a entrega como falha em
    qualquer status code diferente de 2xx.
    """
    try:
        payload = await request.json()
    except Exception:
        logger.warning("[GHL WEBHOOK] token=%s body inválido (não é JSON)", token)
        return {"status": "ok"}

    try:
        await webhook_service.processar_lead_ghl(db, token, payload)
    except Exception as exc:
        # log e segue. Não queremos que o GHL marque como falha.
        logger.exception("[GHL WEBHOOK] token=%s erro=%s", token, exc)
        await db.rollback()

    return {"status": "ok"}
