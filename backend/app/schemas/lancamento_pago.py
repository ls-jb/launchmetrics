"""Schemas do Lançamento Pago."""
from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas._types import Money

Categoria = Literal[
    "ingresso",
    "order_bump_ingresso",
    "principal",
    "order_bump_principal",
    "upsell",
    "downsell",
]


# ============================================================
# Cadastro
# ============================================================
class LancamentoPagoCreate(BaseModel):
    nome: str = Field(..., min_length=1, max_length=200)
    data_inicio: date
    data_abertura_carrinho: date


class LancamentoPagoUpdate(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=200)
    data_inicio: date | None = None
    data_abertura_carrinho: date | None = None


class OfertaCreate(BaseModel):
    produto: str = Field(..., min_length=1, max_length=200)
    oferta_nome: str | None = Field(default=None, max_length=200)
    oferta_codigo: str | None = Field(default=None, max_length=200)
    categoria: Categoria


# ============================================================
# Leitura
# ============================================================
class LancamentoPagoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nome: str
    data_inicio: date
    data_abertura_carrinho: date
    data_fim: date


class OfertaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    produto: str
    oferta_nome: str | None = None
    oferta_codigo: str | None = None
    categoria: Categoria


class TotalCategoria(BaseModel):
    categoria: Categoria
    quantidade: int
    receita: Money


class LancamentoPagoCompleto(BaseModel):
    """Tudo que a página de detalhe precisa."""

    lancamento: LancamentoPagoResponse
    ofertas: list[OfertaResponse]
    totais_por_categoria: list[TotalCategoria]
    """Uma linha por categoria configurada (categorias sem oferta cadastrada
    não aparecem). Receita do dashboard real (override + dedup + recorrência
    seq<=1 + aprovada) restrita à janela do lançamento."""
