from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas._types import Money

StatusLancamento = Literal["pre_lancamento", "captacao", "carrinho", "encerrado"]


# ============================================================
# Velocidade (gráfico de leads por dia)
# ============================================================
class PontoVelocidade(BaseModel):
    """Um ponto do gráfico de captação de leads por dia."""

    dia: date
    leads: int


# ============================================================
# CANAL
# ============================================================
class CanalResponse(BaseModel):
    """Canal com a contagem de leads (calculada no service)."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    nome: str
    investimento: Money
    leads: int = 0


class CanalUpdate(BaseModel):
    """Item da lista para o PATCH /lancamentos/{id}/canais."""

    id: UUID
    investimento: Decimal = Field(..., ge=0)


class LeadsPorUtmContent(BaseModel):
    """Drill-down de um canal: quantos leads por utm_content."""

    utm_content: str
    quantidade: int


# ============================================================
# LANCAMENTO
# ============================================================
class LancamentoBase(BaseModel):
    nome: str = Field(..., min_length=1, max_length=200)
    status: StatusLancamento = "pre_lancamento"
    data_inicio: date | None = None
    data_fim: date | None = None
    meta_leads: int | None = Field(default=None, ge=0)
    teto_investimento: Money | None = Field(default=None, ge=0)
    meta_roas: Money | None = Field(default=None, ge=0)
    meta_receita: Money | None = Field(default=None, ge=0)


class LancamentoCreate(BaseModel):
    """Form simplificado: só os 5 campos essenciais. status fica em
    'captacao' por default; os demais (ROAS/receita) caíram fora."""

    nome: str = Field(..., min_length=1, max_length=200)
    data_inicio: date | None = None
    data_fim: date | None = None
    meta_leads: int | None = Field(default=None, ge=0)
    teto_investimento: Money | None = Field(default=None, ge=0)


class LancamentoUpdate(BaseModel):
    """Todos os campos são opcionais para permitir patch parcial."""

    nome: str | None = Field(default=None, min_length=1, max_length=200)
    status: StatusLancamento | None = None
    data_inicio: date | None = None
    data_fim: date | None = None
    meta_leads: int | None = Field(default=None, ge=0)
    teto_investimento: Decimal | None = Field(default=None, ge=0)
    meta_roas: Decimal | None = Field(default=None, ge=0)
    meta_receita: Decimal | None = Field(default=None, ge=0)
    meta_ad_account_id: str | None = None
    meta_filtro_nome: str | None = None


class LancamentoResponse(LancamentoBase):
    """Resposta completa, com métricas calculadas no service."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    webhook_token: str
    criado_em: datetime
    meta_ad_account_id: str | None = None
    meta_filtro_nome: str | None = None

    # métricas calculadas
    total_leads: int = 0
    investimento_total: Money = Decimal("0")
    receita_total: Money = Decimal("0")
    cpl: Money = Decimal("0")
    roas: Money = Decimal("0")
    canais: list[CanalResponse] = []
