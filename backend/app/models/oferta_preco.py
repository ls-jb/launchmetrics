from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class OfertaPreco(Base):
    """
    Override de valor por oferta. Usado quando o webhook não traz o valor real
    da oferta (ex: boleto parcelado Hotmart manda só a parcela). O dashboard
    usa este valor no lugar do valor da transação para todas as vendas da
    oferta correspondente.
    """

    __tablename__ = "ofertas_precos"
    __table_args__ = {"schema": "launchmetrics"}

    oferta_codigo: Mapped[str] = mapped_column(String, primary_key=True)
    oferta_nome: Mapped[str | None] = mapped_column(String)
    valor: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
