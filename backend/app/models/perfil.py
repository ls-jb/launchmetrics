from datetime import datetime
from uuid import UUID as UUIDType

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Perfil(Base):
    """
    Papel de um usuário no sistema. user_id é o id do Supabase Auth (== 'sub'
    do JWT). 'admin' pode configurar tudo; 'viewer' só vê os dashboards.
    """

    __tablename__ = "perfis"
    __table_args__ = {"schema": "launchmetrics"}

    user_id: Mapped[UUIDType] = mapped_column(UUID(as_uuid=True), primary_key=True)
    email: Mapped[str] = mapped_column(String, nullable=False)
    nome: Mapped[str | None] = mapped_column(String)
    papel: Mapped[str] = mapped_column(String, nullable=False, default="viewer")
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
