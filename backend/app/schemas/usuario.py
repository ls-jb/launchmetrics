from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

Papel = Literal["admin", "viewer"]


class UsuarioResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: UUID
    email: str
    nome: str | None = None
    papel: Papel
    criado_em: datetime


class UsuarioCreate(BaseModel):
    """Cria um usuário no Supabase Auth + perfil. Requer SUPABASE_SERVICE_KEY."""

    email: str
    senha: str = Field(..., min_length=6)
    nome: str | None = None
    papel: Papel = "viewer"


class UsuarioUpdatePapel(BaseModel):
    papel: Papel


class MeuPerfilResponse(BaseModel):
    """Perfil do usuário logado (pra o frontend decidir o que mostrar)."""

    user_id: UUID
    email: str
    nome: str | None = None
    papel: Papel
