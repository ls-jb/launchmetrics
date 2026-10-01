"""Endpoints da Luzi — assistente de IA de vendas. Qualquer usuário logado."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db
from app.middleware.auth import verify_token
from app.schemas.luzi import ChatLuziRequest, ChatLuziResponse, LuziConfigResponse
from app.services import luzi_service
from app.services.luzi_service import LuziErro

router = APIRouter(prefix="/luzi", tags=["luzi"])


@router.get("/config", response_model=LuziConfigResponse)
async def config(_: dict = Depends(verify_token)):
    """Perpétuos onde o botão da Luzi aparece."""
    return LuziConfigResponse(perpetuos_habilitados=settings.luzi_perpetuos_list)


@router.post("/perpetuos/{perpetuo_id}/chat", response_model=ChatLuziResponse)
async def chat(
    perpetuo_id: UUID,
    body: ChatLuziRequest,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    """Envia o histórico da conversa e recebe a resposta da Luzi."""
    if not luzi_service.habilitada(perpetuo_id):
        raise HTTPException(status_code=404, detail="A Luzi não está habilitada neste perpétuo.")
    try:
        resposta = await luzi_service.conversar(
            db, perpetuo_id, body.mensagens, body.inicio, body.fim
        )
    except LuziErro as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.detail) from exc
    return ChatLuziResponse(resposta=resposta)
