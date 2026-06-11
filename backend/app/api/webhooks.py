"""
Endpoints de webhooks externos.

Princípios comuns:
- SEM autenticação JWT (as plataformas não conseguem enviar Authorization header).
- A autenticação é por token secreto enviado pela plataforma e validado contra
  uma env var nossa (HOTMART_HOTTOK, GURU_TOKEN).
- SEMPRE retornam 200 — as plataformas marcam a entrega como falha em status
  diferente de 2xx e ainda tentam reenviar, gerando duplicação.
- Erros são logados mas não propagam.
- TUDO que chega vai pra tabela webhook_logs (mesmo eventos ignorados),
  pra ter rastro completo de auditoria/debug.
"""
import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.models import WebhookLog
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
    payload, headers = await _ler_payload(request)
    log = _criar_log("GHL", payload, headers, autorizado=True)
    db.add(log)

    try:
        await webhook_service.processar_lead_ghl(db, token, payload or {})
        log.processado = True
    except Exception as exc:
        logger.exception("[GHL] erro: %s", exc)
        log.erro = str(exc)[:500]
        # Reabre transação para conseguir gravar o log do erro
        await db.rollback()
        db.add(log)

    await db.commit()
    return {"status": "ok"}


# ============================================================
# Hotmart
# ============================================================
@router.post("/hotmart")
async def receber_venda_hotmart(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    payload, headers = await _ler_payload(request)
    autorizado = _hotmart_autorizado(request)
    evento = (payload or {}).get("event") if isinstance(payload, dict) else None

    log = _criar_log("Hotmart", payload, headers, autorizado=autorizado, evento=evento)
    db.add(log)

    if not autorizado:
        logger.warning("[HOTMART] hottok inválido")
        log.erro = "hottok invalido"
        await db.commit()
        return {"status": "ok"}

    try:
        await hotmart_service.processar(
            db, payload or {}, background_tasks=background_tasks
        )
        log.processado = True
    except Exception as exc:
        logger.exception("[HOTMART] erro: %s", exc)
        log.erro = str(exc)[:500]
        await db.rollback()
        db.add(log)

    await db.commit()
    return {"status": "ok"}


# ============================================================
# Guru
# ============================================================
@router.post("/guru")
async def receber_venda_guru(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    payload, headers = await _ler_payload(request)
    autorizado = _guru_autorizado(request)
    evento = (payload or {}).get("event") if isinstance(payload, dict) else None

    log = _criar_log("Guru", payload, headers, autorizado=autorizado, evento=evento)
    db.add(log)

    if not autorizado:
        logger.warning("[GURU] token inválido")
        log.erro = "token invalido"
        await db.commit()
        return {"status": "ok"}

    try:
        await guru_service.processar(
            db, payload or {}, background_tasks=background_tasks
        )
        log.processado = True
    except Exception as exc:
        logger.exception("[GURU] erro: %s", exc)
        log.erro = str(exc)[:500]
        await db.rollback()
        db.add(log)

    await db.commit()
    return {"status": "ok"}


# ============================================================
# Helpers
# ============================================================
async def _ler_payload(request: Request) -> tuple[dict[str, Any] | None, dict[str, str]]:
    """Lê body JSON e headers (filtrados pra não vazar Authorization etc.)."""
    try:
        payload = await request.json()
    except Exception:
        payload = None

    # Mantém só headers relevantes pra debug, omite auth-related
    headers_filtrados = {
        k.lower(): v
        for k, v in request.headers.items()
        if k.lower()
        in (
            "content-type",
            "user-agent",
            "x-hotmart-hottok",
            "x-guru-token",
            "x-forwarded-for",
            "x-real-ip",
        )
    }
    return payload, headers_filtrados


def _criar_log(
    plataforma: str,
    payload: dict | None,
    headers: dict,
    autorizado: bool,
    evento: str | None = None,
) -> WebhookLog:
    return WebhookLog(
        plataforma=plataforma,
        evento=evento,
        autorizado=autorizado,
        processado=False,
        headers=headers,
        payload=payload,
    )


def _hotmart_autorizado(request: Request) -> bool:
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
