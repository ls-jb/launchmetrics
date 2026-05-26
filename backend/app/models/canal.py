from datetime import datetime
from decimal import Decimal
from uuid import UUID as UUIDType, uuid4

from sqlalchemy import DateTime, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Canal(Base):
    __tablename__ = "canais"
    __table_args__ = (
        UniqueConstraint("lancamento_id", "nome", name="uq_canais_lancamento_nome"),
        {"schema": "launchmetrics"},
    )

    id: Mapped[UUIDType] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    lancamento_id: Mapped[UUIDType] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("launchmetrics.lancamentos.id", ondelete="CASCADE"),
        nullable=False,
    )
    nome: Mapped[str] = mapped_column(String, nullable=False)
    investimento: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    lancamento: Mapped["Lancamento"] = relationship(back_populates="canais")  # type: ignore[name-defined]  # noqa: F821
    leads: Mapped[list["Lead"]] = relationship(back_populates="canal", lazy="noload")  # type: ignore[name-defined]  # noqa: F821
