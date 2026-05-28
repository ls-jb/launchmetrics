from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID as UUIDType, uuid4

from sqlalchemy import DateTime, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Venda(Base):
    """
    Cada linha representa UMA compra do cliente (não uma transação ou cobrança).
    Split de cartão (R$1k + R$2k) vem como UMA linha com valor=R$3k.
    Recorrência mensal vem como N linhas (uma por cobrança), mas só a primeira
    (recorrencia_seq=1) entra nas métricas do dashboard.
    """

    __tablename__ = "vendas"
    __table_args__ = {"schema": "launchmetrics"}

    id: Mapped[UUIDType] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)

    # Origem
    plataforma: Mapped[str] = mapped_column(String, nullable=False)
    external_id: Mapped[str | None] = mapped_column(String)
    """ID único dentro da plataforma (Hotmart transaction_id, Guru id, etc.).
    NULL para vendas Manual sem id externo. Combinado com plataforma forma
    a chave de deduplicação."""

    # O que foi vendido
    produto: Mapped[str] = mapped_column(String, nullable=False)
    oferta: Mapped[str | None] = mapped_column(String)
    """Categoria: Principal | Order Bump | Upsell | Downsell. Pode ficar NULL
    para vendas manuais sem distinção de oferta."""

    oferta_nome: Mapped[str | None] = mapped_column(String)
    """Nome real da oferta na plataforma (ex: 'Oferta Principal CVA 05/26')."""

    oferta_codigo: Mapped[str | None] = mapped_column(String)
    """Código/ID da oferta na plataforma (Hotmart offer.code, Guru offer.id)."""

    # Como é a venda
    tipo: Mapped[str] = mapped_column(String, nullable=False, default="unica")
    """'unica' | 'recorrencia'"""

    recorrencia_seq: Mapped[int | None] = mapped_column()
    """1 para a primeira cobrança da assinatura, 2 para a segunda, etc.
    NULL para vendas únicas. Só vendas com seq=1 entram no dashboard."""

    assinatura_id: Mapped[str | None] = mapped_column(String)
    """ID da assinatura na plataforma de origem. Liga as N cobranças da
    mesma recorrência."""

    metodo_pagamento: Mapped[str | None] = mapped_column(String)
    """'cartao' | 'boleto' | 'pix' | 'transferencia' | 'cartao_2x' | 'outro'"""

    # Valores
    valor: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="aprovada")
    """'aprovada' | 'pendente' | 'cancelada' | 'reembolsada'"""

    # Comprador
    comprador_nome: Mapped[str | None] = mapped_column(String)
    comprador_email: Mapped[str | None] = mapped_column(String)

    # Datas
    data_venda: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # Auditoria: payload original do webhook
    payload_bruto: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
