"""
Perpétuos — produtos vendidos continuamente, sem janela de lançamento.

Cada perpétuo agrupa N produtos (cada um casa com vendas.produto). As métricas
(receita, qtd, ROAS, gráfico diário) usam a MESMA regra de venda real do
Lançamento Pago: override de ofertas_precos + dedup por email+oferta_codigo
+ recorrência seq<=1 + status aprovada. Janela: [data_inicio, hoje].
"""
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID as UUIDType, uuid4

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

_SCHEMA = "launchmetrics"


class Perpetuo(Base):
    __tablename__ = "perpetuos"
    __table_args__ = {"schema": _SCHEMA}

    id: Mapped[UUIDType] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    nome: Mapped[str] = mapped_column(String, nullable=False)
    data_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    """A partir desse dia, as vendas dos produtos contam pro perpétuo."""
    investimento: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=0
    )
    """Investimento acumulado em mídia — edita inline na tela."""
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class PerpetuoProduto(Base):
    """Liga um perpétuo a um produto (texto que casa com vendas.produto)."""

    __tablename__ = "perpetuos_produtos"
    __table_args__ = {"schema": _SCHEMA}

    id: Mapped[UUIDType] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    perpetuo_id: Mapped[UUIDType] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.perpetuos.id", ondelete="CASCADE"),
        nullable=False,
    )
    produto: Mapped[str] = mapped_column(String, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class PerpetuoAporte(Base):
    """Aporte de investimento de um dia específico. Investimento total do
    perpétuo agora é a SOMA dos aportes (o campo perpetuos.investimento
    fica como legacy/snapshot, mas a fonte de verdade são os aportes)."""

    __tablename__ = "perpetuos_aportes"
    __table_args__ = {"schema": _SCHEMA}

    id: Mapped[UUIDType] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    perpetuo_id: Mapped[UUIDType] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.perpetuos.id", ondelete="CASCADE"),
        nullable=False,
    )
    dia: Mapped[date] = mapped_column(Date, nullable=False)
    valor: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    descricao: Mapped[str | None] = mapped_column(String)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
