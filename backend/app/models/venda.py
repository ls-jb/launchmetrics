from datetime import datetime
from decimal import Decimal
from uuid import UUID as UUIDType, uuid4

from sqlalchemy import DateTime, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Venda(Base):
    __tablename__ = "vendas"
    __table_args__ = {"schema": "launchmetrics"}

    id: Mapped[UUIDType] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    plataforma: Mapped[str] = mapped_column(String, nullable=False)
    produto: Mapped[str] = mapped_column(String, nullable=False)
    oferta: Mapped[str] = mapped_column(String, nullable=False)
    valor: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="aprovada")
    comprador_nome: Mapped[str | None] = mapped_column(String)
    comprador_email: Mapped[str | None] = mapped_column(String)
    data_venda: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
