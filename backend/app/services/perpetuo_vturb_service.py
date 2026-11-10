"""
VSLs (VTurb) dos perpétuos: vínculos VSL ↔ perpétuo e o painel com as
métricas do vídeo cruzadas com as vendas reais da mesma categoria.

Regras de cálculo (todas aqui no backend):
- Contagens somam entre VSLs; taxas são recalculadas a partir das somas
  (nunca média de porcentagens). Engajamento e tempo médio usam média
  ponderada pelos plays únicos.
- Retenção no pitch = quem ainda assistia no segundo do pitch ÷ quem
  entrou na curva (mesma conta do painel da VTurb). Sem pitch cadastrado
  na VTurb → None.
- Conversões/receita da VTurb são atribuição por pixel: aparecem só como
  referência e NUNCA entram em vendas/faturamento (vêm de `vendas`).
- Custo por play/view só na categoria Principal: o investimento em
  tráfego leva gente pra VSL principal, não pras de upsell/downsell.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Perpetuo, PerpetuoVturbPlayer
from app.schemas.perpetuo import PerpetuoCompleto
from app.schemas.perpetuo_vturb import (
    CategoriaVsl,
    VslAnalise,
    VslAnaliseJanela,
    VslAnaliseLinha,
    VslCurva,
    VslCurvaPonto,
    VslKpis,
    VslLinhaPlayer,
    VslPainel,
    VslPontoDia,
    VturbPlayerCreate,
    VturbPlayerDisponivel,
    VturbPlayerResponse,
)
from app.services import perpetuo_service
from app.services import vturb_service as vt

ORDEM_CATEGORIAS: tuple[CategoriaVsl, ...] = ("Principal", "Upsell", "UpUpsell", "Downsell")
PASSO_CURVA_SEG = 5


# ============================================================
# Vínculos
# ============================================================
async def listar_vinculos(db: AsyncSession, perpetuo_id: UUID) -> list[PerpetuoVturbPlayer]:
    rows = await db.execute(
        select(PerpetuoVturbPlayer)
        .where(PerpetuoVturbPlayer.perpetuo_id == perpetuo_id)
        .order_by(PerpetuoVturbPlayer.criado_em)
    )
    return list(rows.scalars().all())


async def _vinculo(
    db: AsyncSession, perpetuo_id: UUID, player_id: str
) -> PerpetuoVturbPlayer | None:
    rows = await db.execute(
        select(PerpetuoVturbPlayer).where(
            PerpetuoVturbPlayer.perpetuo_id == perpetuo_id,
            PerpetuoVturbPlayer.player_id == player_id,
        )
    )
    return rows.scalar_one_or_none()


async def adicionar_vinculo(
    db: AsyncSession, perpetuo_id: UUID, dados: VturbPlayerCreate
) -> PerpetuoVturbPlayer | None:
    """Liga a VSL ao perpétuo. Se já estiver ligada, atualiza categoria/nome."""
    if not await db.get(Perpetuo, perpetuo_id):
        return None
    vinculo = await _vinculo(db, perpetuo_id, dados.player_id)
    if vinculo is None:
        vinculo = PerpetuoVturbPlayer(perpetuo_id=perpetuo_id, player_id=dados.player_id)
        db.add(vinculo)
    vinculo.categoria = dados.categoria
    vinculo.player_nome = dados.player_nome or vinculo.player_nome
    await db.commit()
    await db.refresh(vinculo)
    return vinculo


async def atualizar_categoria(
    db: AsyncSession, vinculo_id: UUID, categoria: CategoriaVsl
) -> PerpetuoVturbPlayer | None:
    vinculo = await db.get(PerpetuoVturbPlayer, vinculo_id)
    if vinculo is None:
        return None
    vinculo.categoria = categoria
    await db.commit()
    await db.refresh(vinculo)
    return vinculo


async def remover_vinculo(db: AsyncSession, vinculo_id: UUID) -> bool:
    vinculo = await db.get(PerpetuoVturbPlayer, vinculo_id)
    if vinculo is None:
        return False
    await db.delete(vinculo)
    await db.commit()
    return True


# ============================================================
# Catálogo de VSLs da conta (tela de vínculo)
# ============================================================
async def _catalogo(db: AsyncSession) -> dict[str, vt.PlayerVturb]:
    consulta = vt.consulta_players()
    resp = await vt.resolver(db, [consulta])
    return vt.normalizar_players(resp[consulta.chave])


def _player_de(vinculo: PerpetuoVturbPlayer, catalogo: dict[str, vt.PlayerVturb]) -> vt.PlayerVturb:
    """Dados da VSL na VTurb; se ela sumiu da conta, usa o nome salvo."""
    return catalogo.get(vinculo.player_id) or vt.PlayerVturb(
        id=vinculo.player_id, nome=vinculo.player_nome or vinculo.player_id
    )


async def listar_disponiveis(db: AsyncSession) -> list[VturbPlayerDisponivel]:
    """Todas as VSLs da conta, as mais assistidas nos últimos 30 dias primeiro."""
    hoje = vt.hoje_br()
    c_players = vt.consulta_players()
    c_plays = vt.consulta_plays_por_player(hoje - timedelta(days=30), hoje)
    resp = await vt.resolver(db, [c_players, c_plays])
    plays = vt.normalizar_plays_por_player(resp[c_plays.chave])
    itens = [
        VturbPlayerDisponivel(
            player_id=p.id,
            nome=p.nome,
            duracao_seg=p.duracao_seg,
            pitch_seg=p.pitch_seg,
            plays_30d=plays.get(p.id, 0),
            criado_em=p.criado_em,
        )
        for p in vt.normalizar_players(resp[c_players.chave]).values()
    ]
    itens.sort(key=lambda i: (-i.plays_30d, i.nome.lower()))
    return itens


# ============================================================
# Cálculos (funções puras)
# ============================================================
def _pct(num: int | Decimal | None, den: int) -> float | None:
    """Arredonda meio pra cima (43,125 → 43,13), igual ao painel da VTurb."""
    if num is None or not den:
        return None
    return float((Decimal(num) * 100 / Decimal(den)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _por_unidade(valor: Decimal | None, den: int) -> Decimal | None:
    if valor is None or not den:
        return None
    return (Decimal(valor) / den).quantize(Decimal("0.01"))


def media_ponderada(pares: list[tuple[float | None, int]]) -> float | None:
    validos = [(v, p) for v, p in pares if v is not None and p > 0]
    peso = sum(p for _, p in validos)
    return round(sum(v * p for v, p in validos) / peso, 2) if peso else None


def somar_stats(lista: list[vt.StatsVsl]) -> vt.StatsVsl:
    total = vt.StatsVsl()
    for campo in vt.CAMPOS_CONTAGEM:
        setattr(total, campo, sum(getattr(s, campo) for s in lista))
    total.engajamento = media_ponderada([(s.engajamento, s.plays_unicos) for s in lista])
    return total


@dataclass
class ResumoVsl:
    """Tudo que vira KPI de uma VSL (ou da soma de várias)."""

    stats: vt.StatsVsl
    engajamento: float | None = None
    tempo_medio_seg: float | None = None
    pitch: tuple[int, int] | None = None
    """(pessoas assistindo no pitch, pessoas na curva). None = sem pitch."""


@dataclass
class ResultadoReal:
    """Vendas reais (tabela `vendas`) da categoria no período."""

    vendas: int
    receita: Decimal
    investimento: Decimal | None = None
    """Só na categoria Principal."""


def resumo_da_vsl(
    player: vt.PlayerVturb, stats: vt.StatsVsl, eng: vt.EngajamentoVsl
) -> ResumoVsl:
    """O engajamento da janela vem da curva (é o número do painel da VTurb);
    o de /sessions/stats só entra se a curva não veio. Sem play no período,
    engajamento/tempo/pitch não existem (a VTurb manda 0, que engana)."""
    if not stats.plays_unicos:
        return ResumoVsl(stats)
    pitch = None
    if player.pitch_seg and eng.total_usuarios:
        pitch = (eng.assistindo_em(player.pitch_seg), eng.total_usuarios)
    engajamento = eng.engajamento if eng.engajamento is not None else stats.engajamento
    return ResumoVsl(stats, engajamento, eng.tempo_medio_seg, pitch)


def somar_resumos(resumos: list[ResumoVsl]) -> ResumoVsl:
    pesos = [r.stats.plays_unicos for r in resumos]
    pitches = [r.pitch for r in resumos if r.pitch]
    return ResumoVsl(
        stats=somar_stats([r.stats for r in resumos]),
        engajamento=media_ponderada([(r.engajamento, p) for r, p in zip(resumos, pesos)]),
        tempo_medio_seg=media_ponderada([(r.tempo_medio_seg, p) for r, p in zip(resumos, pesos)]),
        pitch=(sum(a for a, _ in pitches), sum(b for _, b in pitches)) if pitches else None,
    )


def montar_kpis(r: ResumoVsl, real: ResultadoReal | None = None) -> VslKpis:
    s = r.stats
    kpis = VslKpis(
        views=s.views,
        views_unicas=s.views_unicas,
        plays=s.plays,
        plays_unicos=s.plays_unicos,
        play_rate=_pct(s.plays_unicos, s.views_unicas),
        engajamento=r.engajamento,
        tempo_medio_seg=r.tempo_medio_seg,
        finalizacoes=s.finalizacoes,
        finalizacoes_unicas=s.finalizacoes_unicas,
        taxa_finalizacao=_pct(s.finalizacoes_unicas, s.plays_unicos),
        cliques=s.cliques,
        cliques_unicos=s.cliques_unicos,
        taxa_clique=_pct(s.cliques_unicos, s.plays_unicos),
        audiencia_pitch=r.pitch[0] if r.pitch else None,
        retencao_pitch=_pct(r.pitch[0], r.pitch[1]) if r.pitch else None,
        conversoes_vturb=s.conversoes,
        receita_vturb=Decimal(s.receita_centavos) / 100,
        conversao_vturb=_pct(s.conversoes, s.plays_unicos),
    )
    return _com_resultado_real(kpis, real, s) if real else kpis


def _com_resultado_real(kpis: VslKpis, real: ResultadoReal, s: vt.StatsVsl) -> VslKpis:
    return kpis.model_copy(
        update={
            "vendas_reais": real.vendas,
            "receita_real": real.receita,
            "conversao_real": _pct(real.vendas, s.plays_unicos),
            "receita_por_play": _por_unidade(real.receita, s.plays_unicos),
            "investimento": real.investimento,
            "custo_por_play": _por_unidade(real.investimento, s.plays_unicos),
            "custo_por_view": _por_unidade(real.investimento, s.views_unicas),
        }
    )


def resultado_real(completo: PerpetuoCompleto, categoria: CategoriaVsl) -> ResultadoReal:
    ofertas = [o for o in completo.ofertas if o.categoria == categoria]
    return ResultadoReal(
        vendas=sum(o.quantidade for o in ofertas),
        receita=sum((Decimal(o.receita) for o in ofertas), Decimal("0")),
        investimento=Decimal(completo.investimento_total) if categoria == "Principal" else None,
    )


def _ponto_dia(dia: date, s: vt.StatsVsl) -> VslPontoDia:
    return VslPontoDia(
        dia=dia,
        views=s.views,
        views_unicas=s.views_unicas,
        plays=s.plays,
        plays_unicos=s.plays_unicos,
        play_rate=_pct(s.plays_unicos, s.views_unicas),
        engajamento=s.engajamento,
        finalizacoes_unicas=s.finalizacoes_unicas,
        cliques_unicos=s.cliques_unicos,
        taxa_clique=_pct(s.cliques_unicos, s.plays_unicos),
        conversoes_vturb=s.conversoes,
    )


def serie_diaria(series: list[dict[date, vt.StatsVsl]]) -> list[VslPontoDia]:
    """Soma as VSLs dia a dia (cada dia com as próprias taxas recalculadas)."""
    por_dia: dict[date, list[vt.StatsVsl]] = defaultdict(list)
    for serie in series:
        for dia, s in serie.items():
            por_dia[dia].append(s)
    return [_ponto_dia(dia, somar_stats(por_dia[dia])) for dia in sorted(por_dia)]


# ============================================================
# Painel
# ============================================================
@dataclass
class _DadosVsl:
    vinculo: PerpetuoVturbPlayer
    player: vt.PlayerVturb
    stats: vt.StatsVsl
    por_dia: dict[date, vt.StatsVsl]
    engajamento: vt.EngajamentoVsl


def _consultas_painel(p: vt.PlayerVturb, inicio: date, fim: date) -> list[vt.Consulta]:
    video = {"duracao_seg": p.duracao_seg, "pitch_seg": p.pitch_seg}
    consultas = [
        vt.consulta_stats(p.id, inicio, fim, **video),
        vt.consulta_stats(p.id, inicio, fim, por_dia=True, **video),
    ]
    if p.duracao_seg:  # a curva exige a duração do vídeo
        consultas.append(vt.consulta_engajamento(p.id, p.duracao_seg, inicio, fim))
    return consultas


async def _buscar_dados(
    db: AsyncSession, vinculos: list[PerpetuoVturbPlayer], inicio: date, fim: date
) -> list[_DadosVsl]:
    catalogo = await _catalogo(db)
    players = [_player_de(v, catalogo) for v in vinculos]
    por_player = [_consultas_painel(p, inicio, fim) for p in players]
    resp = await vt.resolver(db, [c for lista in por_player for c in lista])
    dados: list[_DadosVsl] = []
    for vinculo, player, consultas in zip(vinculos, players, por_player):
        stats, por_dia, *eng = (resp[c.chave] for c in consultas)
        dados.append(
            _DadosVsl(
                vinculo=vinculo,
                player=player,
                stats=vt.normalizar_stats(stats if isinstance(stats, dict) else {}),
                por_dia=vt.normalizar_stats_por_dia(por_dia, inicio, fim),
                engajamento=vt.normalizar_engajamento(eng[0]) if eng else vt.EngajamentoVsl(),
            )
        )
    return dados


def _linha(d: _DadosVsl, resumo: ResumoVsl) -> VslLinhaPlayer:
    return VslLinhaPlayer(
        vinculo_id=d.vinculo.id,
        player_id=d.player.id,
        nome=d.player.nome,
        categoria=d.vinculo.categoria,  # type: ignore[arg-type]
        duracao_seg=d.player.duracao_seg,
        pitch_seg=d.player.pitch_seg,
        kpis=montar_kpis(resumo),
    )


def _com_dados(
    painel: VslPainel, categoria: CategoriaVsl, dados: list[_DadosVsl], completo: PerpetuoCompleto
) -> VslPainel:
    resumos = [resumo_da_vsl(d.player, d.stats, d.engajamento) for d in dados]
    linhas = [_linha(d, r) for d, r in zip(dados, resumos)]
    return painel.model_copy(
        update={
            "kpis": montar_kpis(somar_resumos(resumos), resultado_real(completo, categoria)),
            "dias": serie_diaria([d.por_dia for d in dados]),
            "players": sorted(linhas, key=lambda linha: -linha.kpis.plays_unicos),
        }
    )


async def painel_vsl(
    db: AsyncSession,
    perpetuo_id: UUID,
    categoria: CategoriaVsl | None = None,
    inicio: date | None = None,
    fim: date | None = None,
) -> VslPainel | None:
    """Painel da categoria pedida (ou da 1ª que tiver VSL), na mesma janela
    do resto da tela do perpétuo (default = data_inicio..hoje)."""
    completo = await perpetuo_service.obter(db, perpetuo_id, inicio, fim)
    if completo is None:
        return None
    vinculos = await listar_vinculos(db, perpetuo_id)
    disponiveis = [c for c in ORDEM_CATEGORIAS if any(v.categoria == c for v in vinculos)]
    escolhida = categoria if categoria in disponiveis else next(iter(disponiveis), None)
    painel = VslPainel(
        configurado=vt.configurada(),
        inicio=completo.inicio,
        fim=completo.fim,
        categoria=escolhida,
        categorias_disponiveis=disponiveis,
        vinculos=[VturbPlayerResponse.model_validate(v) for v in vinculos],
    )
    if escolhida is None or not painel.configurado:
        return painel
    da_categoria = [v for v in vinculos if v.categoria == escolhida]
    dados = await _buscar_dados(db, da_categoria, completo.inicio, completo.fim)
    return _com_dados(painel, escolhida, dados, completo)


# ============================================================
# Análise rápida (topo do perpétuo): 7 e 30 dias, fixos
# ============================================================
JANELAS_ANALISE: tuple[tuple[int, int], ...] = ((7, 6), (30, 30))
"""(dias do rótulo, quantos dias antes de hoje a janela começa). São as
janelas "Últimos 7 dias" / "Últimos 30 dias" do painel da VTurb — conferido
com a planilha do time em 09/11/2026: a de 7 começa em hoje−6 e a de 30 em
hoje−30 (as duas terminam hoje)."""
SEG_1MIN, SEG_5MIN = 60, 300
PLAYS_DIA_LANCAMENTO = 10
MAX_DIAS_HISTORICO = 365


def janelas_analise(hoje: date) -> list[tuple[int, date, date]]:
    return [(dias, hoje - timedelta(days=atras), hoje) for dias, atras in JANELAS_ANALISE]


def inicio_no_ar(por_dia: dict[date, vt.StatsVsl]) -> date | None:
    """1º dia de tráfego de verdade. Antes do lançamento costuma ter uns plays
    de teste da equipe (ex.: 6 plays em 23/10 e o tráfego só a partir de
    27/10), então vale o 1º dia com pelo menos 10 plays — ou 10% do maior
    dia, em VSL de pouco tráfego (upsell), pra não pular dias reais."""
    plays = {dia: s.plays_unicos for dia, s in por_dia.items() if s.plays_unicos}
    if not plays:
        return None
    minimo = min(PLAYS_DIA_LANCAMENTO, max(plays.values()) * 0.1)
    return min(dia for dia, n in plays.items() if n >= minimo)


def _data_br(iso: str | None) -> date | None:
    """'2026-11-09T02:00:00.000Z' → data no fuso de Brasília (08/11)."""
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).astimezone(vt.BR_TZ).date()
    except ValueError:
        return None


@dataclass
class _Historico:
    """Série diária da VSL desde que ela foi criada — só pra achar o início."""

    player_id: str
    inicio: date
    consulta: vt.Consulta


def _historico(p: vt.PlayerVturb, hoje: date) -> _Historico:
    limite = hoje - timedelta(days=MAX_DIAS_HISTORICO)
    inicio = max(_data_br(p.criado_em) or limite, limite)
    consulta = vt.consulta_stats(p.id, inicio, hoje, por_dia=True, duracao_seg=p.duracao_seg, pitch_seg=p.pitch_seg)
    return _Historico(p.id, inicio, consulta)


def _inicios_no_ar(historicos: list[_Historico], resp: dict, hoje: date) -> dict[str, date | None]:
    return {
        h.player_id: inicio_no_ar(vt.normalizar_stats_por_dia(resp[h.consulta.chave], h.inicio, hoje))
        for h in historicos
    }


def retencao_em(player: vt.PlayerVturb, eng: vt.EngajamentoVsl, segundo: int | None) -> float | None:
    """% de quem deu play que ainda assistia no segundo dado. None sem curva,
    sem o segundo (pitch não cadastrado) ou se ele passa do fim do vídeo."""
    total = eng.total_usuarios
    if not total or not segundo:
        return None
    if player.duracao_seg and segundo > player.duracao_seg:
        return None
    return _pct(eng.assistindo_em(segundo), total)


def linha_analise(
    player: vt.PlayerVturb,
    categoria: CategoriaVsl,
    stats: vt.StatsVsl,
    eng: vt.EngajamentoVsl,
    no_ar_desde: date | None = None,
    hoje: date | None = None,
) -> VslAnaliseLinha:
    if not stats.plays_unicos:  # sem play a VTurb manda curva zerada, que engana
        eng = vt.EngajamentoVsl()
    return VslAnaliseLinha(
        no_ar_desde=no_ar_desde,
        dias_no_ar=(hoje - no_ar_desde).days + 1 if no_ar_desde and hoje else None,
        player_id=player.id,
        nome=player.nome,
        categoria=categoria,
        plays_unicos=stats.plays_unicos,
        retencao_1min=retencao_em(player, eng, SEG_1MIN),
        retencao_5min=retencao_em(player, eng, SEG_5MIN),
        retencao_pitch=retencao_em(player, eng, player.pitch_seg),
        conversao_vturb=_pct(stats.conversoes, stats.plays_unicos),
        play_rate=_pct(stats.plays_unicos, stats.views_unicas),
        conversoes_vturb=stats.conversoes,
    )


def ordenar_janelas(janelas: list[VslAnaliseJanela]) -> list[VslAnaliseJanela]:
    """Mesma ordem de VSLs em todas as janelas (fica fácil comparar 7 × 30):
    por categoria e, dentro dela, quem tem mais plays na janela mais longa."""
    if not janelas:
        return janelas
    plays = {linha.player_id: linha.plays_unicos for linha in janelas[-1].linhas}

    def chave(linha: VslAnaliseLinha) -> tuple[int, int, str]:
        return (ORDEM_CATEGORIAS.index(linha.categoria), -plays.get(linha.player_id, 0), linha.nome.lower())

    return [j.model_copy(update={"linhas": sorted(j.linhas, key=chave)}) for j in janelas]


def _consultas_analise(p: vt.PlayerVturb, inicio: date, fim: date) -> tuple[vt.Consulta, vt.Consulta | None]:
    stats = vt.consulta_stats(p.id, inicio, fim, duracao_seg=p.duracao_seg, pitch_seg=p.pitch_seg)
    eng = vt.consulta_engajamento(p.id, p.duracao_seg, inicio, fim) if p.duracao_seg else None
    return stats, eng


@dataclass
class _PedidoAnalise:
    """Tudo que a análise pede à VTurb: stats + curva por janela e o histórico."""

    vinculos: list[PerpetuoVturbPlayer]
    players: list[vt.PlayerVturb]
    hoje: date
    janelas: list[tuple[int, date, date]]
    por_janela: list[list[tuple[vt.Consulta, vt.Consulta | None]]]
    historicos: list[_Historico]

    def consultas(self) -> list[vt.Consulta]:
        das_janelas = [c for lista in self.por_janela for par in lista for c in par if c is not None]
        return das_janelas + [h.consulta for h in self.historicos]


def _pedido_analise(vinculos: list[PerpetuoVturbPlayer], catalogo: dict[str, vt.PlayerVturb]) -> _PedidoAnalise:
    players = [_player_de(v, catalogo) for v in vinculos]
    hoje = vt.hoje_br()
    janelas = janelas_analise(hoje)
    return _PedidoAnalise(
        vinculos=vinculos,
        players=players,
        hoje=hoje,
        janelas=janelas,
        por_janela=[[_consultas_analise(p, ini, fim) for p in players] for _, ini, fim in janelas],
        historicos=[_historico(p, hoje) for p in players],
    )


def _linha_da_resposta(
    vinculo: PerpetuoVturbPlayer,
    player: vt.PlayerVturb,
    consultas: tuple[vt.Consulta, vt.Consulta | None],
    resp: dict,
    no_ar_desde: date | None,
    hoje: date,
) -> VslAnaliseLinha:
    c_stats, c_eng = consultas
    bruto = resp[c_stats.chave]
    stats = vt.normalizar_stats(bruto if isinstance(bruto, dict) else {})
    eng = vt.normalizar_engajamento(resp[c_eng.chave]) if c_eng else vt.EngajamentoVsl()
    return linha_analise(player, vinculo.categoria, stats, eng, no_ar_desde, hoje)  # type: ignore[arg-type]


def _montar_janelas(pedido: _PedidoAnalise, resp: dict) -> list[VslAnaliseJanela]:
    no_ar = _inicios_no_ar(pedido.historicos, resp, pedido.hoje)
    return [
        VslAnaliseJanela(
            dias=dias,
            inicio=ini,
            fim=fim,
            linhas=[
                _linha_da_resposta(v, p, par, resp, no_ar.get(p.id), pedido.hoje)
                for v, p, par in zip(pedido.vinculos, pedido.players, consultas)
            ],
        )
        for (dias, ini, fim), consultas in zip(pedido.janelas, pedido.por_janela)
    ]


async def analise_vsl(db: AsyncSession, perpetuo_id: UUID) -> VslAnalise | None:
    """Retenção em 1 min / 5 min / pitch, conversão (pixel) e play rate de
    cada VSL vinculada, nos últimos 7 e 30 dias — independe do filtro de
    data — e desde quando cada VSL está no ar."""
    if not await db.get(Perpetuo, perpetuo_id):
        return None
    analise = VslAnalise(configurado=vt.configurada())
    vinculos = await listar_vinculos(db, perpetuo_id)
    if not vinculos or not analise.configurado:
        return analise
    pedido = _pedido_analise(vinculos, await _catalogo(db))
    resp = await vt.resolver(db, pedido.consultas())
    return analise.model_copy(update={"janelas": ordenar_janelas(_montar_janelas(pedido, resp))})


# ============================================================
# Curva de retenção de uma VSL
# ============================================================
def _agrupar(por_segundo: dict[int, int], passo: int) -> dict[int, int]:
    grupos: dict[int, int] = defaultdict(int)
    for segundo, valor in por_segundo.items():
        grupos[segundo // passo * passo] += valor
    return grupos


def montar_curva(
    player: vt.PlayerVturb,
    eng: vt.EngajamentoVsl,
    cliques: dict[int, int],
    conversoes: dict[int, int],
) -> VslCurva:
    """Um ponto a cada PASSO_CURVA_SEG segundos: retenção (%), pessoas
    assistindo, cliques e conversões naquele trecho."""
    total = eng.total_usuarios
    cliques_g = _agrupar(cliques, PASSO_CURVA_SEG)
    conversoes_g = _agrupar(conversoes, PASSO_CURVA_SEG)
    ultimo = max([player.duracao_seg or 0, *eng.saidas_por_segundo, *cliques_g, *conversoes_g])
    pontos: list[VslCurvaPonto] = []
    for segundo in range(0, ultimo + 1, PASSO_CURVA_SEG):
        dentro = total and (not player.duracao_seg or segundo <= player.duracao_seg)
        usuarios = eng.assistindo_em(segundo) if dentro else None
        pontos.append(
            VslCurvaPonto(
                segundo=segundo,
                usuarios=usuarios,
                retencao=_pct(usuarios, total),
                cliques=cliques_g.get(segundo, 0),
                conversoes=conversoes_g.get(segundo, 0),
            )
        )
    return VslCurva(
        player_id=player.id,
        nome=player.nome,
        duracao_seg=player.duracao_seg,
        pitch_seg=player.pitch_seg,
        tempo_medio_seg=eng.tempo_medio_seg if total else None,
        engajamento=eng.engajamento if total else None,
        pontos=pontos,
    )


async def curva_vsl(
    db: AsyncSession,
    perpetuo_id: UUID,
    player_id: str,
    inicio: date | None = None,
    fim: date | None = None,
) -> VslCurva | None:
    perp = await db.get(Perpetuo, perpetuo_id)
    vinculo = await _vinculo(db, perpetuo_id, player_id) if perp else None
    if perp is None or vinculo is None:
        return None
    inicio, fim = inicio or perp.data_inicio, fim or date.today()
    player = _player_de(vinculo, await _catalogo(db))
    c_cliques = vt.consulta_cliques_por_tempo(player.id, inicio, fim)
    c_conversoes = vt.consulta_conversoes_por_tempo(player.id, inicio, fim)
    consultas = [c_cliques, c_conversoes]
    if player.duracao_seg:
        consultas.append(vt.consulta_engajamento(player.id, player.duracao_seg, inicio, fim))
    resp = await vt.resolver(db, consultas)
    eng = vt.normalizar_engajamento(resp[consultas[2].chave]) if len(consultas) > 2 else vt.EngajamentoVsl()
    return montar_curva(
        player,
        eng,
        vt.normalizar_por_tempo(resp[c_cliques.chave], "total_users"),
        vt.normalizar_por_tempo(resp[c_conversoes.chave], "timed_conversions"),
    )
