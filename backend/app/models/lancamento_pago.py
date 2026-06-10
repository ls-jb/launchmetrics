"""
Lançamento Pago — recorrente (semanal). Vendas vêm das tabelas reais (vendas)
via oferta_codigo + janela de datas; aqui guardamos só o "agrupamento" de
quais ofertas pertencem a qual lançamento e em qual categoria.
"""
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID as UUIDType, uuid4

from sqlalchemy import Date, DateTime, ForeignKey, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

_SCHEMA = "launchmetrics"


class LancamentoPago(Base):
    __tablename__ = "lancamentos_pagos"
    __table_args__ = {"schema": _SCHEMA}

    id: Mapped[UUIDType] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    nome: Mapped[str] = mapped_column(String, nullable=False)
    ingresso_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    """Primeiro dia de venda do ingresso."""
    ingresso_fim: Mapped[date] = mapped_column(Date, nullable=False)
    """Último dia em que venda de ingresso conta neste lançamento."""
    principal_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    """Dia em que o carrinho do principal abre (pitch)."""
    principal_fim: Mapped[date] = mapped_column(Date, nullable=False)
    """Último dia em que venda do principal/bumps/upsell conta."""
    investimento: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=0
    )
    """Investimento em mídia para esse lançamento pago — edita inline na tela."""
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class LancamentoPagoOferta(Base):
    __tablename__ = "lancamentos_pagos_ofertas"
    __table_args__ = {"schema": _SCHEMA}

    id: Mapped[UUIDType] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    lancamento_id: Mapped[UUIDType] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.lancamentos_pagos.id", ondelete="CASCADE"),
        nullable=False,
    )
    produto: Mapped[str] = mapped_column(String, nullable=False)
    oferta_nome: Mapped[str | None] = mapped_column(String)
    oferta_codigo: Mapped[str | None] = mapped_column(String)
    categoria: Mapped[str] = mapped_column(String, nullable=False)
    """ingresso | order_bump_ingresso | principal | order_bump_principal
    | upsell | downsell"""
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class LancamentoPagoAjuste(Base):
    """Venda "manual" adicionada à oferta de um lançamento — apenas visual.
    NÃO entra no dashboard (não toca `vendas`). Usar pra incluir vendas que
    saíram fora da janela do lançamento, ou correções pontuais."""

    __tablename__ = "lancamentos_pagos_ajustes"
    __table_args__ = {"schema": _SCHEMA}

    id: Mapped[UUIDType] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    lancamento_oferta_id: Mapped[UUIDType] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.lancamentos_pagos_ofertas.id", ondelete="CASCADE"),
        nullable=False,
    )
    quantidade: Mapped[int] = mapped_column(nullable=False, default=1)
    valor: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    descricao: Mapped[str | None] = mapped_column(String)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
