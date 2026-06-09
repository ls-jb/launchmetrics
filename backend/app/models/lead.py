from datetime import datetime
from uuid import UUID as UUIDType, uuid4

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Lead(Base):
    __tablename__ = "leads"
    __table_args__ = {"schema": "launchmetrics"}

    id: Mapped[UUIDType] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    lancamento_id: Mapped[UUIDType] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("launchmetrics.lancamentos.id", ondelete="CASCADE"),
        nullable=False,
    )
    canal_id: Mapped[UUIDType | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("launchmetrics.canais.id", ondelete="SET NULL"),
    )
    nome: Mapped[str | None] = mapped_column(String)
    email: Mapped[str | None] = mapped_column(String)
    telefone: Mapped[str | None] = mapped_column(String)
    origem: Mapped[str | None] = mapped_column(String)
    utm_content: Mapped[str | None] = mapped_column(String)
    """Conteúdo do anúncio (ex: criativo/banner). Usado pro drill-down do canal."""
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    lancamento: Mapped["Lancamento"] = relationship(back_populates="leads")  # type: ignore[name-defined]  # noqa: F821
    canal: Mapped["Canal | None"] = relationship(back_populates="leads")  # type: ignore[name-defined]  # noqa: F821
