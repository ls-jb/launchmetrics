from datetime import date, datetime
from decimal import Decimal
from uuid import UUID as UUIDType, uuid4

from sqlalchemy import Date, DateTime, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Lancamento(Base):
    __tablename__ = "lancamentos"
    __table_args__ = {"schema": "launchmetrics"}

    id: Mapped[UUIDType] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    nome: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="pre_lancamento")
    data_inicio: Mapped[date | None] = mapped_column(Date)
    data_fim: Mapped[date | None] = mapped_column(Date)
    meta_leads: Mapped[int | None] = mapped_column(Integer)
    meta_roas: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    meta_receita: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    teto_investimento: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    """Teto de investimento estimado pra todo o lançamento (admin define)."""
    webhook_token: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    canais: Mapped[list["Canal"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        back_populates="lancamento", cascade="all, delete-orphan", lazy="selectin"
    )
    leads: Mapped[list["Lead"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        back_populates="lancamento", cascade="all, delete-orphan", lazy="noload"
    )
