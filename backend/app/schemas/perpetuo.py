"""Schemas dos Perpétuos."""
from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas._types import Money


# ============================================================
# Categoria de oferta (heurística pelo nome — mesma do guru_service)
# ============================================================
Categoria = Literal[
    "Principal", "Order Bump", "Upsell", "Downsell", "Outros"
]


# ============================================================
# Cadastro
# ============================================================
class PerpetuoCreate(BaseModel):
    nome: str = Field(..., min_length=1, max_length=200)
    data_inicio: date
    investimento: Money | None = Field(default=0, ge=0)
    """Legacy — mantido pra compat com chamadores antigos. Hoje o
    investimento real vem dos aportes."""


class PerpetuoUpdate(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=200)
    data_inicio: date | None = None
    investimento: Money | None = Field(default=None, ge=0)
    meta_ad_account_id: str | None = Field(default=None, max_length=64)
    meta_filtro_nome: str | None = Field(default=None, max_length=200)


class OfertaCreate(BaseModel):
    """Adiciona uma oferta ao perpétuo."""

    oferta_codigo: str = Field(..., min_length=1, max_length=200)
    oferta_nome: str | None = Field(default=None, max_length=200)


# ============================================================
# Leitura
# ============================================================
class PerpetuoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nome: str
    data_inicio: date
    investimento: Money = 0  # type: ignore[assignment]
    meta_ad_account_id: str | None = None
    meta_filtro_nome: str | None = None


class PerpetuoOfertaResponse(BaseModel):
    """Linha simples de oferta cadastrada (sem métricas)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    oferta_codigo: str
    oferta_nome: str | None = None


class OfertaDetalhe(BaseModel):
    """Oferta cadastrada + métricas no período filtrado."""

    id: UUID
    """ID da linha em perpetuos_ofertas (pra remover)."""
    oferta_codigo: str
    oferta_nome: str | None = None
    categoria: Categoria
    """Categoria heurística pelo nome (Principal / Upsell / etc)."""
    quantidade: int
    receita: Money


class PontoVendaCategoria(BaseModel):
    """Ponto do gráfico diário — 1 linha por (dia × categoria).
    Investimento do dia vem em ponto separado pra simplificar o frontend."""

    dia: date
    categoria: Categoria
    quantidade: int
    receita: Money


class PontoInvestimentoDia(BaseModel):
    """Ponto de investimento por dia (soma dos aportes do dia)."""

    dia: date
    valor: Money


class AporteCreate(BaseModel):
    """Aporte de investimento de um dia. valor é em R$, podendo ser zero."""

    dia: date
    valor: Money = Field(..., ge=0)
    descricao: str | None = Field(default=None, max_length=200)


class AporteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    dia: date
    valor: Money
    descricao: str | None = None


class PerpetuoCompleto(BaseModel):
    """Tudo que a tela de detalhe precisa, JÁ FILTRADO pelo período
    passado em inicio/fim (default = data_inicio..hoje)."""

    perpetuo: PerpetuoResponse

    # janela considerada (pra UI mostrar)
    inicio: date
    fim: date

    # ofertas cadastradas, com métricas no período
    ofertas: list[OfertaDetalhe] = []

    # aportes do perpétuo (todos — pra UI gerenciar; não filtrados)
    aportes: list[AporteResponse] = []

    # totais no período (pra os 4 KPIs)
    investimento_total: Money = 0  # type: ignore[assignment]
    receita_total: Money = 0  # type: ignore[assignment]
    quantidade_total: int = 0
