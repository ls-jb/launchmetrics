"""
Placar de líderes de venda — atribuição MANUAL de vendas ao time comercial.

Independente das vendas automáticas (Hotmart/Guru). Aqui o time só marca
"quem fechou": cada lançamento tem suas ofertas (produto + valor) e seus
vendedores; a contagem é um tally por (vendedor, oferta) que sobe/desce.
"""
from datetime import datetime
from decimal import Decimal
from uuid import UUID as UUIDType, uuid4

from sqlalchemy import DateTime, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

_SCHEMA = "launchmetrics"


class PlacarLancamento(Base):
    """Um lançamento do placar (ex: 'CVA 05/26'). Só um fica 'ativo' por vez."""

    __tablename__ = "placar_lancamentos"
    __table_args__ = {"schema": _SCHEMA}

    id: Mapped[UUIDType] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    nome: Mapped[str] = mapped_column(String, nullable=False)
    ativo: Mapped[bool] = mapped_column(nullable=False, default=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class PlacarOferta(Base):
    """Uma oferta do lançamento: produto + (nome da oferta) + valor."""

    __tablename__ = "placar_ofertas"
    __table_args__ = {"schema": _SCHEMA}

    id: Mapped[UUIDType] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    lancamento_id: Mapped[UUIDType] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.placar_lancamentos.id", ondelete="CASCADE"),
        nullable=False,
    )
    produto: Mapped[str] = mapped_column(String, nullable=False)
    oferta: Mapped[str | None] = mapped_column(String)
    oferta_codigo: Mapped[str | None] = mapped_column(String)
    """Código da oferta real (vendas.oferta_codigo) — liga o placar às vendas
    automáticas pra calcular o total real do produto/oferta."""
    valor: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class PlacarVendedor(Base):
    """Uma pessoa do time comercial daquele lançamento."""

    __tablename__ = "placar_vendedores"
    __table_args__ = (
        UniqueConstraint("lancamento_id", "nome", name="uq_placar_vendedor_nome"),
        {"schema": _SCHEMA},
    )

    id: Mapped[UUIDType] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    lancamento_id: Mapped[UUIDType] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.placar_lancamentos.id", ondelete="CASCADE"),
        nullable=False,
    )
    nome: Mapped[str] = mapped_column(String, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class PlacarContagem(Base):
    """Tally: quantas vendas o vendedor marcou naquela oferta. Sobe/desce (>=0)."""

    __tablename__ = "placar_contagens"
    __table_args__ = (
        UniqueConstraint("vendedor_id", "oferta_id", name="uq_placar_contagem"),
        {"schema": _SCHEMA},
    )

    id: Mapped[UUIDType] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    vendedor_id: Mapped[UUIDType] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.placar_vendedores.id", ondelete="CASCADE"),
        nullable=False,
    )
    oferta_id: Mapped[UUIDType] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.placar_ofertas.id", ondelete="CASCADE"),
        nullable=False,
    )
    quantidade: Mapped[int] = mapped_column(nullable=False, default=0)
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
