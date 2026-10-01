"""Schemas da Luzi — assistente de IA de vendas."""
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field


class MensagemLuzi(BaseModel):
    papel: Literal["usuario", "luzi"]
    conteudo: str = Field(..., min_length=1, max_length=4000)


class ChatLuziRequest(BaseModel):
    mensagens: list[MensagemLuzi] = Field(..., min_length=1, max_length=30)
    """Histórico da conversa (o frontend guarda). A última deve ser do usuário."""
    inicio: date | None = None
    fim: date | None = None
    """Período filtrado no dashboard — vira contexto pra Luzi."""


class ChatLuziResponse(BaseModel):
    resposta: str


class LuziConfigResponse(BaseModel):
    perpetuos_habilitados: list[str]
    """Ids (minúsculos) vindos de LUZI_PERPETUOS."""
