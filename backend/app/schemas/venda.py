from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas._types import Money

Plataforma = Literal["Hotmart", "Guru", "PagMe", "PagTrust", "Manual"]
Oferta = Literal["Principal", "Order Bump", "Upsell", "Downsell"]
StatusVenda = Literal["aprovada", "pendente", "cancelada", "reembolsada"]
TipoVenda = Literal["unica", "recorrencia"]
MetodoPagamento = Literal[
    "cartao",
    "boleto",
    "pix",
    "transferencia",
    "cartao_2x",
    "outro",
]


class VendaResponse(BaseModel):
    """Venda individual — usado em listagens detalhadas."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    plataforma: Plataforma
    external_id: str | None = None
    produto: str
    oferta: Oferta | None = None
    oferta_nome: str | None = None
    oferta_codigo: str | None = None
    tipo: TipoVenda
    recorrencia_seq: int | None = None
    assinatura_id: str | None = None
    metodo_pagamento: MetodoPagamento | None = None
    valor: Money
    status: StatusVenda
    comprador_nome: str | None = None
    comprador_email: str | None = None
    data_venda: datetime
    criado_em: datetime


class VendaManualCreate(BaseModel):
    """
    Payload do cadastro manual de venda (PIX direto, venda avulsa).
    Sempre cria como plataforma='Manual'. external_id fica em branco.
    """

    produto: str = Field(..., min_length=1, max_length=200)
    valor: Money = Field(..., gt=0)
    metodo_pagamento: MetodoPagamento
    data_venda: datetime
    comprador_nome: str | None = Field(default=None, max_length=200)
    comprador_email: str | None = Field(default=None, max_length=200)
    oferta: Oferta | None = None
    oferta_nome: str | None = Field(default=None, max_length=200)
    oferta_codigo: str | None = Field(default=None, max_length=200)
    tipo: TipoVenda = "unica"
    recorrencia_seq: int | None = Field(default=None, ge=1)
    assinatura_id: str | None = None

    @model_validator(mode="after")
    def valida_coerencia_recorrencia(self) -> "VendaManualCreate":
        if self.tipo == "unica" and self.recorrencia_seq is not None:
            raise ValueError("recorrencia_seq só pode ser preenchido com tipo='recorrencia'")
        if self.tipo == "recorrencia" and self.recorrencia_seq is None:
            raise ValueError("tipo='recorrencia' exige recorrencia_seq (>= 1)")
        return self


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


class OfertaBreakdown(BaseModel):
    """Detalhe de uma oferta dentro de um produto (popup do ranking)."""

    oferta_nome: str | None = None
    oferta_codigo: str | None = None
    valor_oferta: Money  # preço nominal da oferta (maior valor observado)
    quantidade: int
    receita: Money
    valor_override: Money | None = None
    """Se preenchido, há um valor cadastrado em ofertas_precos pra essa oferta."""


class OfertaPrecoUpsert(BaseModel):
    """Cadastro/edição do valor à vista de uma oferta."""

    oferta_codigo: str = Field(..., min_length=1)
    oferta_nome: str | None = None
    valor: Money = Field(..., gt=0)


class OfertaPrecoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    oferta_codigo: str
    oferta_nome: str | None = None
    valor: Money


# Tipo auxiliar — usado pelo webhook service ao normalizar payloads.
class VendaIngest(BaseModel):
    """
    Estrutura interna que webhooks de plataformas externas constroem
    antes de UPSERT no banco. Não exposto pela API pública.
    """

    plataforma: Plataforma
    external_id: str
    produto: str
    oferta: Oferta | None = None
    tipo: TipoVenda = "unica"
    recorrencia_seq: int | None = None
    assinatura_id: str | None = None
    metodo_pagamento: MetodoPagamento | None = None
    valor: Money
    status: StatusVenda
    comprador_nome: str | None = None
    comprador_email: str | None = None
    data_venda: datetime
    payload_bruto: dict[str, Any] | None = None
