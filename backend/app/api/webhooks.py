"""
Endpoints de webhooks externos.

Princípios comuns:
- SEM autenticação JWT (as plataformas não conseguem enviar Authorization header).
- A autenticação é por token secreto enviado pela plataforma e validado contra
  uma env var nossa (HOTMART_HOTTOK, GURU_TOKEN).
- SEMPRE retornam 200 — as plataformas marcam a entrega como falha em status
  diferente de 2xx e ainda tentam reenviar, gerando duplicação.
- Erros são logados mas não propagam.
"""
import logging

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.services import guru_service, hotmart_service, webhook_service

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

logger = logging.getLogger(__name__)


# ============================================================
# GHL (leads — captação de lançamento)
# ============================================================
@router.post("/ghl/{token}")
async def receber_lead_ghl(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Recebe leads do Go High Level. Token na URL identifica o lançamento."""
    try:
        payload = await request.json()
    except Exception:
        logger.warning("[GHL] body inválido (não é JSON) token=%s", token)
        return {"status": "ok"}

    try:
        await webhook_service.processar_lead_ghl(db, token, payload)
    except Exception as exc:
        logger.exception("[GHL] erro: %s", exc)
        await db.rollback()

    return {"status": "ok"}


# ============================================================
# Hotmart
# ============================================================
@router.post("/hotmart")
async def receber_venda_hotmart(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Webhook do Hotmart (formato 2.0). Configure no painel do Hotmart:
    Tools → Webhooks → New Webhook → URL deste endpoint + Hottok secreto.
    """
    if not _hotmart_autorizado(request):
        logger.warning("[HOTMART] hottok inválido")
        return {"status": "ok"}

    try:
        payload = await request.json()
    except Exception:
        logger.warning("[HOTMART] body inválido (não é JSON)")
        return {"status": "ok"}

    try:
        await hotmart_service.processar(db, payload)
    except Exception as exc:
        logger.exception("[HOTMART] erro: %s", exc)
        await db.rollback()

    return {"status": "ok"}


# ============================================================
# Guru (Digital Manager Guru)
# ============================================================
@router.post("/guru")
async def receber_venda_guru(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Webhook do Guru. Configure no painel: Settings → Integrations → Webhooks.
    Token validado via header X-GURU-TOKEN ou query string ?token=...
    """
    if not _guru_autorizado(request):
        logger.warning("[GURU] token inválido")
        return {"status": "ok"}

    try:
        payload = await request.json()
    except Exception:
        logger.warning("[GURU] body inválido (não é JSON)")
        return {"status": "ok"}

    try:
        await guru_service.processar(db, payload)
    except Exception as exc:
        logger.exception("[GURU] erro: %s", exc)
        await db.rollback()

    return {"status": "ok"}


# ============================================================
# Helpers de autorização
# ============================================================
def _hotmart_autorizado(request: Request) -> bool:
    """
    Hotmart envia o token no header X-HOTMART-HOTTOK.
    Se nossa env var HOTMART_HOTTOK estiver vazia, aceitamos qualquer request
    (modo dev).
    """
    esperado = settings.HOTMART_HOTTOK
    if not esperado:
        return True
    recebido = (
        request.headers.get("x-hotmart-hottok")
        or request.headers.get("X-HOTMART-HOTTOK")
        or ""
    )
    return recebido == esperado


def _guru_autorizado(request: Request) -> bool:
    """
    Guru envia o token no header X-GURU-TOKEN ou na query string ?token=...
    Se nossa env var GURU_TOKEN estiver vazia, aceitamos qualquer request.
    """
    esperado = settings.GURU_TOKEN
    if not esperado:
        return True
    recebido = (
        request.headers.get("x-guru-token")
        or request.headers.get("X-GURU-TOKEN")
        or request.query_params.get("token")
        or ""
    )
    return recebido == esperado
