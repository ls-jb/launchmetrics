"""Schemas do dashboard de vendas dos lançamentos e das pastas."""
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas._types import Money
from app.schemas.lancamento import LancamentoResponse


# ============================================================
# PASTAS
# ============================================================
class PastaSalvar(BaseModel):
    """Criar ou renomear uma pasta — ela só tem nome."""

    nome: str = Field(..., min_length=1, max_length=120)


class PastaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nome: str
    criado_em: datetime


# ============================================================
# OFERTAS / PRODUTOS VINCULADOS
# ============================================================
class VinculoOferta(BaseModel):
    """Um item da seleção do dashboard de vendas.

    Com `oferta_codigo` = uma oferta específica. Sem `oferta_codigo` = o
    produto inteiro (todas as ofertas dele, inclusive as futuras)."""

    produto: str | None = Field(default=None, max_length=300)
    oferta_codigo: str | None = Field(default=None, max_length=200)
    oferta_nome: str | None = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def _limpar_e_validar(self) -> "VinculoOferta":
        self.produto = (self.produto or "").strip() or None
        self.oferta_codigo = (self.oferta_codigo or "").strip() or None
        self.oferta_nome = (self.oferta_nome or "").strip() or None
        if not self.produto and not self.oferta_codigo:
            raise ValueError("Informe o produto ou o código da oferta.")
        return self


class VinculoOfertaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    produto: str | None = None
    oferta_codigo: str | None = None
    oferta_nome: str | None = None


# ============================================================
# PAINEL
# ============================================================
class OfertaVendida(BaseModel):
    """Uma linha da tabela: o que cada oferta vendeu no período."""

    produto: str
    oferta_codigo: str | None = None
    oferta_nome: str | None = None
    quantidade: int
    receita: Money


class ProdutoVendido(BaseModel):
    """Um produto do lançamento, com o subtotal e as ofertas dele."""

    produto: str
    inteiro: bool = False
    """True = o produto foi marcado por inteiro (não oferta por oferta)."""
    quantidade: int
    receita: Money
    ofertas: list[OfertaVendida] = []


class PontoVendaDia(BaseModel):
    """Ponto do gráfico de receita por dia (dia em horário de Brasília)."""

    dia: date
    quantidade: int
    receita: Money


class LancamentoVendasPainel(BaseModel):
    """Tudo que a tela do dashboard de vendas precisa, numa chamada só."""

    lancamento: LancamentoResponse
    vinculos: list[VinculoOfertaResponse] = []
    """O que está selecionado (ofertas e produtos inteiros)."""
    produtos: list[ProdutoVendido] = []
    """Quanto cada produto vendeu, aberto por oferta — maior receita primeiro."""
    por_dia: list[PontoVendaDia] = []
