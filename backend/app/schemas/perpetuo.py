"""Schemas dos Perpétuos."""
from datetime import date
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas._types import Money


# ============================================================
# Cadastro
# ============================================================
class PerpetuoCreate(BaseModel):
    nome: str = Field(..., min_length=1, max_length=200)
    data_inicio: date
    investimento: Money | None = Field(default=0, ge=0)
    produtos: list[str] = Field(default_factory=list)
    """Produtos selecionados na criação. Pode ser vazio — adiciona depois."""


class PerpetuoUpdate(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=200)
    data_inicio: date | None = None
    investimento: Money | None = Field(default=None, ge=0)


class ProdutoCreate(BaseModel):
    """Adiciona um produto a um perpétuo existente."""

    produto: str = Field(..., min_length=1, max_length=200)


# ============================================================
# Leitura
# ============================================================
class PerpetuoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nome: str
    data_inicio: date
    investimento: Money = 0  # type: ignore[assignment]


class PerpetuoProdutoResponse(BaseModel):
    """Um produto cadastrado num perpétuo."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    produto: str


class OfertaBreakdownProduto(BaseModel):
    """Breakdown por oferta dentro de um produto do perpétuo."""

    oferta_codigo: str | None = None
    oferta_nome: str | None = None
    quantidade: int
    receita: Money


class ProdutoDetalhe(BaseModel):
    """Card de produto no detalhe do perpétuo."""

    id: UUID
    """ID da linha em perpetuos_produtos (pra remover)."""
    produto: str
    quantidade: int
    receita: Money
    ofertas: list[OfertaBreakdownProduto] = []
    """Breakdown por oferta_codigo desse produto na janela. Carrega no
    expand do card."""


class AporteCreate(BaseModel):
    """Aporte de investimento de um dia. valor é em R$, podendo ser zero
    (ex: registrar que naquele dia houve campanha mas custo foi 0)."""

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
    """Tudo que a tela de detalhe precisa."""

    perpetuo: PerpetuoResponse
    produtos: list[ProdutoDetalhe]
    """Produtos cadastrados, com qtd+receita totais (todas as ofertas
    agregadas). Ordenados por receita desc."""
    aportes: list[AporteResponse] = []
    """Aportes de investimento (dia × valor). Ordem: dia asc. A soma
    desses aportes é o investimento total — o campo perpetuo.investimento
    fica como legacy."""
    investimento_total: Money = 0  # type: ignore[assignment]
    """Soma dos aportes — fonte de verdade do investimento agora."""


class PontoVendaProduto(BaseModel):
    """Ponto do gráfico diário (1 linha por dia × produto). Frontend
    filtra pelos produtos marcados nos checkboxes."""

    dia: date
    produto: str
    quantidade: int
    receita: Money
