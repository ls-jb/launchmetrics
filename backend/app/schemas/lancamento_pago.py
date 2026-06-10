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
    ingresso_inicio: date
    ingresso_fim: date
    principal_inicio: date
    principal_fim: date


class LancamentoPagoUpdate(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=200)
    ingresso_inicio: date | None = None
    ingresso_fim: date | None = None
    principal_inicio: date | None = None
    principal_fim: date | None = None
    investimento: Money | None = Field(default=None, ge=0)


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
    ingresso_inicio: date
    ingresso_fim: date
    principal_inicio: date
    principal_fim: date
    investimento: Money = 0  # type: ignore[assignment]


class OfertaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    produto: str
    oferta_nome: str | None = None
    oferta_codigo: str | None = None
    categoria: Categoria


class AjusteCreate(BaseModel):
    """Adiciona uma venda manual (apenas visual) a uma oferta do lançamento."""

    quantidade: int = Field(default=1, ge=1, le=200)
    valor: Money = Field(..., gt=0)
    descricao: str | None = Field(default=None, max_length=200)


class AjusteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    quantidade: int
    valor: Money
    descricao: str | None = None


class OfertaDetalhe(BaseModel):
    """Uma oferta configurada + métricas (vendas reais + ajustes manuais)."""

    id: UUID
    produto: str
    oferta_nome: str | None = None
    oferta_codigo: str | None = None
    quantidade: int
    """Total = vendas reais + soma dos ajustes manuais."""
    receita: Money
    quantidade_manual: int = 0
    """Só os ajustes manuais (subset do total)."""
    receita_manual: Money = 0  # type: ignore[assignment]
    ajustes: list[AjusteResponse] = []


class TotalCategoria(BaseModel):
    categoria: Categoria
    quantidade: int
    receita: Money
    ofertas: list[OfertaDetalhe]
    """Cada oferta configurada nessa categoria com suas métricas (0 se ainda
    sem venda). Ordenadas por receita desc."""


class LancamentoPagoCompleto(BaseModel):
    """Tudo que a página de detalhe precisa."""

    lancamento: LancamentoPagoResponse
    totais_por_categoria: list[TotalCategoria]
    """Categorias que têm pelo menos uma oferta configurada. Receita usa a
    mesma regra do dashboard (override + dedup + recorrência seq<=1 +
    aprovada), restrita à janela do lançamento."""


class PontoVendaCategoria(BaseModel):
    """Um ponto do gráfico de vendas diárias do Lançamento Pago.
    quantidade/receita já vêm somadas por dia × categoria — o front filtra
    pelas categorias marcadas nos checkboxes."""

    dia: date
    categoria: Categoria
    quantidade: int
    receita: Money
