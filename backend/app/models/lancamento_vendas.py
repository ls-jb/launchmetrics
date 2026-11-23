"""
Pastas e ofertas dos lançamentos.

LancamentoPasta junta os dashboards do mesmo lançamento (ex.: pasta "Black"
com o dash de leads e o dash de vendas da Black) — é só um agrupador.

LancamentoOferta diz o que conta como venda de um dashboard de vendas
(lancamentos.tipo == 'vendas'). As vendas em si continuam na tabela
`vendas`; aqui fica só o vínculo.
"""
from datetime import datetime
from uuid import UUID as UUIDType, uuid4

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

_SCHEMA = "launchmetrics"


class LancamentoPasta(Base):
    __tablename__ = "lancamentos_pastas"
    __table_args__ = {"schema": _SCHEMA}

    id: Mapped[UUIDType] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    nome: Mapped[str] = mapped_column(String, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class LancamentoOferta(Base):
    __tablename__ = "lancamentos_ofertas"
    __table_args__ = {"schema": _SCHEMA}

    id: Mapped[UUIDType] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    lancamento_id: Mapped[UUIDType] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey(f"{_SCHEMA}.lancamentos.id", ondelete="CASCADE"),
        nullable=False,
    )
    produto: Mapped[str | None] = mapped_column(String)
    """Nome do produto (casa com vendas.produto). Num vínculo de oferta é
    só informativo; num vínculo de produto é o que filtra as vendas."""
    oferta_codigo: Mapped[str | None] = mapped_column(String)
    """Preenchido = vínculo com UMA oferta (casa com vendas.oferta_codigo).
    Nulo = vínculo com o PRODUTO inteiro: todas as ofertas dele contam,
    inclusive as criadas depois e as vendas sem código de oferta."""
    oferta_nome: Mapped[str | None] = mapped_column(String)
    """Denormalizado pra tela mostrar o nome mesmo sem venda no período."""
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
