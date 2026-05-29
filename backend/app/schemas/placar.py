"""Schemas do placar de líderes."""
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas._types import Money


# ============================================================
# Cadastro (admin)
# ============================================================
class LancamentoCreate(BaseModel):
    nome: str = Field(..., min_length=1, max_length=200)


class LancamentoUpdate(BaseModel):
    nome: str | None = Field(default=None, min_length=1, max_length=200)
    ativo: bool | None = None


class OfertaCreate(BaseModel):
    produto: str = Field(..., min_length=1, max_length=200)
    oferta: str | None = Field(default=None, max_length=200)
    valor: Money = Field(..., gt=0)


class VendedorCreate(BaseModel):
    nome: str = Field(..., min_length=1, max_length=200)


# ============================================================
# Marcação
# ============================================================
class MarcacaoRequest(BaseModel):
    vendedor_id: UUID
    oferta_id: UUID
    delta: int = Field(..., description="+1 pra marcar uma venda, -1 pra desmarcar")


class MarcacaoResponse(BaseModel):
    vendedor_id: UUID
    oferta_id: UUID
    quantidade: int


# ============================================================
# Leitura
# ============================================================
class LancamentoResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nome: str
    ativo: bool


class OfertaResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    produto: str
    oferta: str | None = None
    valor: Money


class VendedorResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nome: str


class ContagemItem(BaseModel):
    vendedor_id: UUID
    oferta_id: UUID
    quantidade: int


class RankingItem(BaseModel):
    vendedor_id: UUID
    nome: str
    quantidade_total: int
    receita_total: Money


class PlacarCompleto(BaseModel):
    """Tudo que a página do placar precisa numa tacada só."""

    lancamento: LancamentoResponse
    ofertas: list[OfertaResponse]
    vendedores: list[VendedorResponse]
    ranking: list[RankingItem]
    contagens: list[ContagemItem]
