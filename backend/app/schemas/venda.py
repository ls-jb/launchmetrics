from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict

from app.schemas._types import Money

Plataforma = Literal["Hotmart", "PagMe", "PagTrust"]
Oferta = Literal["Principal", "Order Bump", "Upsell", "Downsell"]
StatusVenda = Literal["aprovada", "pendente", "cancelada", "reembolsada"]


class VendaResponse(BaseModel):
    """Venda individual — usado em listagens detalhadas."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    plataforma: Plataforma
    produto: str
    oferta: Oferta
    valor: Money
    status: StatusVenda
    comprador_nome: str | None = None
    comprador_email: str | None = None
    data_venda: datetime
    criado_em: datetime


class ResumoVendas(BaseModel):
    """KPIs para o topo do Dashboard de Vendas."""

    receita_total: Money
    quantidade: int
    ticket_medio: Money


class PontoReceita(BaseModel):
    """Um ponto do gráfico de receita por dia."""

    data: date
    receita: Money


class ProdutoRanking(BaseModel):
    """Um item do ranking de produtos."""

    produto: str
    quantidade: int
    receita: Money
