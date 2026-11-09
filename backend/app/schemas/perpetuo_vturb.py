"""Schemas das VSLs (VTurb) dos perpétuos.

Taxas vêm em porcentagem (0–100) e são None quando o denominador é zero.
Conversões/receita "_vturb" são atribuição por pixel da VTurb — só
referência; vendas e faturamento reais vêm da tabela `vendas`.
"""
from datetime import date
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas._types import Money

CategoriaVsl = Literal["Principal", "Upsell", "UpUpsell", "Downsell"]


# ============================================================
# Vínculo VSL ↔ perpétuo
# ============================================================
class VturbPlayerCreate(BaseModel):
    """Liga uma VSL ao perpétuo. Se já estiver ligada, só atualiza a
    categoria/nome (idempotente)."""

    player_id: str = Field(..., min_length=1, max_length=64)
    player_nome: str | None = Field(default=None, max_length=300)
    categoria: CategoriaVsl


class VturbPlayerUpdate(BaseModel):
    categoria: CategoriaVsl


class VturbPlayerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    player_id: str
    player_nome: str | None = None
    categoria: CategoriaVsl


class VturbPlayerDisponivel(BaseModel):
    """VSL da conta VTurb, pra escolher na tela de vínculo."""

    player_id: str
    nome: str
    duracao_seg: int | None = None
    pitch_seg: int | None = None
    """Segundo do pitch cadastrado no painel da VTurb (None = não cadastrado)."""
    plays_30d: int = 0
    criado_em: str | None = None


# ============================================================
# Painel
# ============================================================
class VslKpis(BaseModel):
    """Métricas de uma VSL (ou da soma das VSLs de uma categoria)."""

    views: int = 0
    views_unicas: int = 0
    plays: int = 0
    plays_unicos: int = 0
    play_rate: float | None = None
    engajamento: float | None = None
    tempo_medio_seg: float | None = None
    finalizacoes: int = 0
    finalizacoes_unicas: int = 0
    taxa_finalizacao: float | None = None
    cliques: int = 0
    cliques_unicos: int = 0
    taxa_clique: float | None = None
    audiencia_pitch: int | None = None
    """Quantas pessoas ainda assistiam no segundo do pitch."""
    retencao_pitch: float | None = None
    conversoes_vturb: int = 0
    receita_vturb: Money = Field(default=0)  # type: ignore[assignment]
    conversao_vturb: float | None = None

    # Cruzamento com vendas reais da mesma categoria (só no total da categoria)
    vendas_reais: int | None = None
    receita_real: Money | None = None
    conversao_real: float | None = None
    receita_por_play: Money | None = None
    # Só na categoria Principal (o tráfego pago leva pra VSL principal)
    investimento: Money | None = None
    custo_por_play: Money | None = None
    custo_por_view: Money | None = None


class VslPontoDia(BaseModel):
    dia: date
    views: int = 0
    views_unicas: int = 0
    plays: int = 0
    plays_unicos: int = 0
    play_rate: float | None = None
    engajamento: float | None = None
    finalizacoes_unicas: int = 0
    cliques_unicos: int = 0
    taxa_clique: float | None = None
    conversoes_vturb: int = 0


class VslLinhaPlayer(BaseModel):
    """Uma VSL na tabela comparativa."""

    vinculo_id: UUID
    player_id: str
    nome: str
    categoria: CategoriaVsl
    duracao_seg: int | None = None
    pitch_seg: int | None = None
    kpis: VslKpis


class VslPainel(BaseModel):
    """Tudo que a seção de VSLs precisa, já filtrado por categoria e janela."""

    configurado: bool
    """False = falta a chave da VTurb no backend (mostra aviso na tela)."""
    inicio: date
    fim: date
    categoria: CategoriaVsl | None = None
    categorias_disponiveis: list[CategoriaVsl] = []
    vinculos: list[VturbPlayerResponse] = []
    kpis: VslKpis | None = None
    dias: list[VslPontoDia] = []
    players: list[VslLinhaPlayer] = []


# ============================================================
# Análise rápida (topo do perpétuo): janelas fixas de 7 e 30 dias
# ============================================================
class VslAnaliseLinha(BaseModel):
    """Uma VSL numa janela da análise. Taxas em % (None = sem dado)."""

    player_id: str
    nome: str
    categoria: CategoriaVsl
    plays_unicos: int = 0
    retencao_1min: float | None = None
    retencao_5min: float | None = None
    retencao_pitch: float | None = None
    """None = pitch não cadastrado na VTurb."""
    conversao_vturb: float | None = None
    """Conversões do pixel VTurb ÷ plays únicos (atribuição, não é venda)."""
    play_rate: float | None = None


class VslAnaliseJanela(BaseModel):
    dias: int
    inicio: date
    fim: date
    linhas: list[VslAnaliseLinha] = []


class VslAnalise(BaseModel):
    configurado: bool
    """False = falta a chave da VTurb no backend."""
    janelas: list[VslAnaliseJanela] = []


class VslCurvaPonto(BaseModel):
    segundo: int
    retencao: float | None = None
    usuarios: int | None = None
    """Pessoas ainda assistindo nesse segundo."""
    cliques: int = 0
    conversoes: int = 0


class VslCurva(BaseModel):
    """Curva de retenção + cliques/conversões por segundo de uma VSL."""

    player_id: str
    nome: str
    duracao_seg: int | None = None
    pitch_seg: int | None = None
    tempo_medio_seg: float | None = None
    engajamento: float | None = None
    pontos: list[VslCurvaPonto] = []
