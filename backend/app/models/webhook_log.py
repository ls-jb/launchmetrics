from datetime import datetime
from typing import Any
from uuid import UUID as UUIDType, uuid4

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class WebhookLog(Base):
    """
    Registro de cada webhook recebido. Útil pra:
    - Verificar se plataformas estão de fato chamando nossos endpoints
    - Inspecionar a estrutura real do payload (parsers se baseiam em docs;
      payloads reais podem variar)
    - Auditoria de eventos ignorados (status não reconhecido, evento fora
      da whitelist, etc.)
    """

    __tablename__ = "webhook_logs"
    __table_args__ = {"schema": "launchmetrics"}

    id: Mapped[UUIDType] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    plataforma: Mapped[str] = mapped_column(String, nullable=False)
    evento: Mapped[str | None] = mapped_column(String)
    autorizado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    processado: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    erro: Mapped[str | None] = mapped_column(String)
    headers: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    recebido_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
