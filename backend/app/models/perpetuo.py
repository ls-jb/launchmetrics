"""
Perpétuos — produtos vendidos continuamente, sem janela de lançamento.

Cada perpétuo agrupa N ofertas (cada uma identificada por oferta_codigo, casa
com vendas.oferta_codigo). As métricas usam a MESMA regra de venda real do
Lançamento Pago: override de ofertas_precos + dedup por email+oferta_codigo
+ recorrência seq<=1 + status aprovada. Janela: [filtro_inicio, filtro_fim]
em BRT — default = [perpetuo.data_inicio, hoje].

Cada perpétuo pode opcionalmente apontar pra uma Ad Account da Meta + filtro
de nome de campanha (ex: "[PAR]") pra sincronização automática de gasto
diário (Sprint 2 — cron pega gasto e gera aportes em perpetuos_aportes).
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
    """A partir desse dia, as vendas das ofertas contam pro perpétuo (default
    do filtro de data; usuário pode escolher janela menor na UI)."""
    investimento: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=0
    )
    """Legacy: campo antigo. Hoje o investimento é a soma dos aportes."""
    meta_ad_account_id: Mapped[str | None] = mapped_column(String)
    """ID numérico da ad account da Meta (ex: '628263058826646'). Opcional."""
    meta_filtro_nome: Mapped[str | None] = mapped_column(String)
    """Pattern (substring) pra filtrar campanhas pelo nome (ex: '[PAR]').
    Quando null, todas as campanhas da conta entram no investimento."""
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class PerpetuoOferta(Base):
    """Liga um perpétuo a uma oferta específica (oferta_codigo casa com
    vendas.oferta_codigo). Cada oferta é cadastrada individualmente — o
    perpétuo pode misturar ofertas de produtos diferentes se quiser."""

    __tablename__ = "perpetuos_ofertas"
    __table_args__ = {"schema": _SCHEMA}

    id: Mapped[UUIDType] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    perpetuo_id: Mapped[UUIDType] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.perpetuos.id", ondelete="CASCADE"),
        nullable=False,
    )
    oferta_codigo: Mapped[str] = mapped_column(String, nullable=False)
    oferta_nome: Mapped[str | None] = mapped_column(String)
    """Denormalizado pra UI mostrar nome sem precisar joinar com vendas."""
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class PerpetuoAporte(Base):
    """Aporte de investimento de um dia específico. Investimento total do
    perpétuo agora é a SOMA dos aportes (no período filtrado). O campo
    perpetuos.investimento fica como legacy/snapshot."""

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
