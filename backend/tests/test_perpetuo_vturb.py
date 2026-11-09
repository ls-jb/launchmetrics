"""Testes das VSLs (VTurb) dos perpétuos — normalização das respostas da
API (fixtures reais capturadas da VSL Direção Suave, 02–08/11/2026),
cálculos do painel e cliente HTTP (sem chamar a VTurb nem o banco).

Os números esperados batem com o painel da VTurb (conferidos via MCP)."""
import json
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

import httpx
import pytest

from app.schemas.perpetuo import OfertaDetalhe, PerpetuoCompleto, PerpetuoResponse
from app.services import perpetuo_vturb_service as svc
from app.services import vturb_service as vt

FIXTURES = Path(__file__).parent / "fixtures" / "vturb"
INICIO, FIM = date(2026, 11, 2), date(2026, 11, 8)
DIRECAO_SUAVE = vt.PlayerVturb(id="6ac69d8dd776e3eb934d6e94", nome="VSL Direção Suave", duracao_seg=1622)


def _fixture(nome: str):
    return json.loads((FIXTURES / f"{nome}.json").read_text(encoding="utf-8"))


# ============================================================
# Normalização (respostas reais)
# ============================================================
def test_normaliza_stats_da_janela():
    s = vt.normalizar_stats(_fixture("stats"))
    assert (s.views, s.views_unicas, s.plays, s.plays_unicos) == (7160, 5958, 4100, 3860)
    assert (s.finalizacoes, s.cliques, s.cliques_unicos, s.conversoes) == (290, 298, 273, 49)
    assert s.receita_centavos == 1545738
    assert s.engajamento == 38.25  # veio como texto "38.25"


def test_serie_diaria_descarta_dias_fora_da_janela():
    dias = vt.normalizar_stats_por_dia(_fixture("stats_por_dia"), INICIO, FIM)
    assert sorted(dias) == [INICIO + timedelta(days=i) for i in range(7)]
    assert dias[INICIO].plays_unicos == 802
    assert dias[INICIO].views_unicas == 1204


def test_engajamento_e_retencao_acumulada():
    eng = vt.normalizar_engajamento(_fixture("engajamento"))
    assert eng.tempo_medio_seg == 618.73
    assert eng.engajamento == 38.15
    assert eng.total_usuarios == 3765
    # mesma curva do painel: 100% → 87,46% → 81,83%
    assert eng.assistindo_em(0) == 3765
    assert round(eng.assistindo_em(5) / 3765 * 100, 2) == 87.46
    assert round(eng.assistindo_em(10) / 3765 * 100, 2) == 81.83


def test_por_tempo_aceita_lista_ou_objeto():
    lista = [{"timed": 5, "timed_conversions": 2}, {"timed": 5, "timed_conversions": 1}]
    assert vt.normalizar_por_tempo(lista, "timed_conversions") == {5: 3}
    assert vt.normalizar_por_tempo({"grouped_timed": lista}, "timed_conversions") == {5: 3}
    assert vt.normalizar_por_tempo(None, "total_users") == {}


def test_normaliza_players_sem_pitch_vira_none():
    players = vt.normalizar_players(
        [{"id": "a", "name": "VSL A", "pitch_time": 0, "duration": 600}, {"name": "sem id"}]
    )
    assert list(players) == ["a"]
    assert players["a"].pitch_seg is None
    assert players["a"].duracao_seg == 600


# ============================================================
# KPIs
# ============================================================
def _resumo_direcao_suave(pitch_seg: int | None = None) -> svc.ResumoVsl:
    player = vt.PlayerVturb(id=DIRECAO_SUAVE.id, nome="x", duracao_seg=1622, pitch_seg=pitch_seg)
    return svc.resumo_da_vsl(
        player, vt.normalizar_stats(_fixture("stats")), vt.normalizar_engajamento(_fixture("engajamento"))
    )


def test_kpis_de_uma_vsl_batem_com_o_painel_da_vturb():
    k = svc.montar_kpis(_resumo_direcao_suave())
    assert k.play_rate == 64.79
    assert k.engajamento == 38.15  # o da curva, não o de /sessions/stats
    assert k.tempo_medio_seg == 618.73
    assert k.conversao_vturb == 1.27
    assert k.receita_vturb == Decimal("15457.38")
    assert k.retencao_pitch is None and k.audiencia_pitch is None  # sem pitch cadastrado
    assert k.vendas_reais is None and k.custo_por_play is None


def test_vsl_sem_play_no_periodo_nao_mostra_engajamento_zero():
    # a VTurb manda engagement_rate 0 e average_watched_time 0 quando ninguém assistiu
    player = vt.PlayerVturb(id="p", nome="x", duracao_seg=1688, pitch_seg=1400)
    eng = vt.EngajamentoVsl(tempo_medio_seg=0.0, engajamento=0.0)
    k = svc.montar_kpis(svc.resumo_da_vsl(player, vt.StatsVsl(views_unicas=10), eng))
    assert k.engajamento is None and k.tempo_medio_seg is None and k.retencao_pitch is None
    curva = svc.montar_curva(player, eng, {}, {})
    assert curva.engajamento is None and curva.tempo_medio_seg is None
    assert all(p.retencao is None for p in curva.pontos)


def test_retencao_no_pitch_usa_a_curva():
    k = svc.montar_kpis(_resumo_direcao_suave(pitch_seg=10))
    assert k.audiencia_pitch == 3765 - 472 - 212
    assert k.retencao_pitch == 81.83


def test_kpis_com_vendas_reais_e_investimento():
    resumo = svc.ResumoVsl(vt.StatsVsl(views_unicas=1000, plays_unicos=500))
    real = svc.ResultadoReal(vendas=10, receita=Decimal("2970"), investimento=Decimal("1000"))
    k = svc.montar_kpis(resumo, real)
    assert k.conversao_real == 2.0
    assert k.receita_por_play == Decimal("5.94")
    assert k.custo_por_play == Decimal("2.00")
    assert k.custo_por_view == Decimal("1.00")


def test_sem_investimento_nao_tem_custo_e_zero_nao_divide():
    k = svc.montar_kpis(svc.ResumoVsl(vt.StatsVsl()), svc.ResultadoReal(3, Decimal("90")))
    assert k.vendas_reais == 3
    assert k.custo_por_play is None and k.custo_por_view is None
    assert k.play_rate is None and k.conversao_real is None and k.receita_por_play is None


def test_somar_resumos_pondera_por_plays_unicos():
    a = svc.ResumoVsl(vt.StatsVsl(plays_unicos=100, views_unicas=200), 40.0, 600.0, (30, 100))
    b = svc.ResumoVsl(vt.StatsVsl(plays_unicos=300, views_unicas=400), 20.0, 200.0, None)
    total = svc.somar_resumos([a, b])
    assert total.stats.plays_unicos == 400 and total.stats.views_unicas == 600
    assert total.engajamento == 25.0
    assert total.tempo_medio_seg == 300.0
    assert total.pitch == (30, 100)  # só quem tem pitch entra
    assert svc.montar_kpis(total).play_rate == 66.67  # recalculada, não média


def test_serie_diaria_soma_vsls_e_recalcula_taxas():
    dia = date(2026, 11, 2)
    a = {dia: vt.StatsVsl(views_unicas=100, plays_unicos=50, engajamento=40.0)}
    b = {dia: vt.StatsVsl(views_unicas=100, plays_unicos=150, engajamento=20.0)}
    vazio = {date(2026, 11, 3): vt.StatsVsl(engajamento=38.0)}  # dia sem play
    pontos = svc.serie_diaria([a, b, vazio])
    assert [p.dia for p in pontos] == [dia, date(2026, 11, 3)]
    assert pontos[0].plays_unicos == 200 and pontos[0].play_rate == 100.0
    assert pontos[0].engajamento == 25.0
    assert pontos[1].engajamento is None


def _completo(ofertas: list[tuple[str, int, str]], investimento: str) -> PerpetuoCompleto:
    return PerpetuoCompleto(
        perpetuo=PerpetuoResponse(id=uuid4(), nome="P", data_inicio=INICIO),
        inicio=INICIO,
        fim=FIM,
        ofertas=[
            OfertaDetalhe(id=uuid4(), oferta_codigo=f"o{i}", categoria=cat, quantidade=q, receita=Decimal(r))
            for i, (cat, q, r) in enumerate(ofertas)
        ],
        investimento_total=Decimal(investimento),
    )


def test_resultado_real_so_da_categoria_e_investimento_so_no_principal():
    completo = _completo(
        [("Principal", 5, "1485"), ("Order Bump", 2, "94"), ("Principal", 1, "297"), ("Upsell", 3, "591")],
        "800",
    )
    principal = svc.resultado_real(completo, "Principal")
    assert (principal.vendas, principal.receita, principal.investimento) == (6, Decimal("1782"), Decimal("800"))
    upsell = svc.resultado_real(completo, "Upsell")
    assert (upsell.vendas, upsell.receita, upsell.investimento) == (3, Decimal("591"), None)


# ============================================================
# Curva
# ============================================================
def test_curva_de_retencao_com_cliques_e_conversoes():
    curva = svc.montar_curva(
        DIRECAO_SUAVE,
        vt.normalizar_engajamento(_fixture("engajamento")),
        vt.normalizar_por_tempo(_fixture("cliques_por_tempo"), "total_users"),
        vt.normalizar_por_tempo(_fixture("conversoes_por_tempo"), "timed_conversions"),
    )
    por_segundo = {p.segundo: p for p in curva.pontos}
    assert por_segundo[0].retencao == 100.0
    assert por_segundo[5].retencao == 87.46
    assert por_segundo[1620].retencao == 8.23
    assert all(p.usuarios is None for p in curva.pontos if p.segundo > 1622)
    assert sum(p.conversoes for p in curva.pontos) == 49
    total_cliques = sum(i["total_users"] for i in _fixture("cliques_por_tempo"))
    assert sum(p.cliques for p in curva.pontos) == total_cliques
    assert curva.tempo_medio_seg == 618.73


# ============================================================
# Análise rápida (7 e 30 dias)
# ============================================================
def test_janelas_da_analise_sao_as_do_painel_da_vturb():
    # Conferido com a planilha do time em 09/11: 7 dias = 03..09, 30 dias = 10/10..09/11
    assert svc.janelas_analise(date(2026, 11, 9)) == [
        (7, date(2026, 11, 3), date(2026, 11, 9)),
        (30, date(2026, 10, 10), date(2026, 11, 9)),
    ]


def test_linha_da_analise_retencao_em_1min_5min_e_pitch():
    player = vt.PlayerVturb(id="x", nome="VSL", duracao_seg=1622, pitch_seg=1200)
    linha = svc.linha_analise(
        player,
        "Principal",
        vt.normalizar_stats(_fixture("stats")),
        vt.normalizar_engajamento(_fixture("engajamento")),
    )
    # 3765 na curva: 2570 ainda assistiam em 1:00, 1881 em 5:00 e 1105 em 20:00
    assert (linha.retencao_1min, linha.retencao_5min, linha.retencao_pitch) == (68.26, 49.96, 29.35)
    assert linha.conversao_vturb == 1.27  # 49 conversões ÷ 3860 plays únicos
    assert linha.play_rate == 64.79
    assert linha.plays_unicos == 3860


def test_analise_sem_pitch_ou_video_curto_fica_sem_valor():
    eng = vt.normalizar_engajamento(_fixture("engajamento"))
    curto = vt.PlayerVturb(id="x", nome="Upsell", duracao_seg=240)
    assert svc.retencao_em(curto, eng, 300) is None  # vídeo acaba antes de 5 min
    assert svc.retencao_em(curto, eng, None) is None  # sem pitch cadastrado
    assert svc.retencao_em(curto, vt.EngajamentoVsl(), 60) is None  # sem curva


def test_analise_vsl_sem_play_nao_mostra_zero():
    player = vt.PlayerVturb(id="x", nome="VSL", duracao_seg=1622, pitch_seg=1200)
    eng_zerada = vt.EngajamentoVsl(saidas_por_segundo={0: 0, 5: 3})
    linha = svc.linha_analise(player, "Principal", vt.StatsVsl(views_unicas=10), eng_zerada)
    assert (linha.retencao_1min, linha.retencao_pitch, linha.conversao_vturb) == (None, None, None)
    assert linha.play_rate == 0.0


def test_analise_mantem_a_mesma_ordem_nas_duas_janelas():
    def linha(pid: str, categoria: str, plays: int) -> svc.VslAnaliseLinha:
        return svc.VslAnaliseLinha(player_id=pid, nome=pid, categoria=categoria, plays_unicos=plays)

    sete = svc.VslAnaliseJanela(
        dias=7, inicio=INICIO, fim=FIM,
        linhas=[linha("up", "Upsell", 900), linha("a", "Principal", 50), linha("b", "Principal", 10)],
    )
    trinta = svc.VslAnaliseJanela(
        dias=30, inicio=INICIO, fim=FIM,
        linhas=[linha("up", "Upsell", 950), linha("a", "Principal", 100), linha("b", "Principal", 300)],
    )
    ordenadas = svc.ordenar_janelas([sete, trinta])
    # Principal antes de Upsell; dentro da categoria, mais plays em 30 dias primeiro
    assert [x.player_id for x in ordenadas[0].linhas] == ["b", "a", "up"]
    assert [x.player_id for x in ordenadas[1].linhas] == ["b", "a", "up"]


def test_analise_pede_stats_com_pitch_e_curva_com_duracao():
    player = vt.PlayerVturb(id="x", nome="VSL", duracao_seg=1882, pitch_seg=1355)
    stats, eng = svc._consultas_analise(player, INICIO, FIM)
    assert stats.caminho == "/sessions/stats"
    assert (stats.corpo["video_duration"], stats.corpo["pitch_time"]) == (1882, 1355)
    assert eng is not None and eng.corpo["video_duration"] == 1882
    assert svc._consultas_analise(vt.PlayerVturb(id="y", nome="sem duração"), INICIO, FIM)[1] is None


def _dias(plays: dict[str, int]) -> dict[date, vt.StatsVsl]:
    return {date.fromisoformat(d): vt.StatsVsl(plays_unicos=n) for d, n in plays.items()}


def test_inicio_no_ar_ignora_plays_de_teste_antes_do_lancamento():
    # Dados reais da VSL lead 2 do Rituais Pro: 6 plays de teste em 23/10,
    # tráfego a partir de 27/10
    serie = _dias({"2026-10-23": 6, "2026-10-24": 0, "2026-10-27": 12, "2026-10-28": 20, "2026-11-02": 187})
    assert svc.inicio_no_ar(serie) == date(2026, 10, 27)


def test_inicio_no_ar_em_vsl_de_pouco_trafego_conta_dia_pequeno():
    assert svc.inicio_no_ar(_dias({"2026-11-01": 1, "2026-11-03": 3, "2026-11-05": 4})) == date(2026, 11, 1)
    # Lançou hoje e ainda não chegou a 10 plays: começa hoje mesmo
    assert svc.inicio_no_ar(_dias({"2026-11-09": 8})) == date(2026, 11, 9)
    assert svc.inicio_no_ar(_dias({"2026-11-09": 0})) is None
    assert svc.inicio_no_ar({}) is None


def test_linha_da_analise_conta_dias_no_ar():
    player = vt.PlayerVturb(id="x", nome="VSL", duracao_seg=1622)
    linha = svc.linha_analise(
        player, "Principal", vt.StatsVsl(plays_unicos=300, views_unicas=600), vt.EngajamentoVsl(),
        no_ar_desde=date(2026, 11, 6), hoje=date(2026, 11, 9),
    )
    assert (linha.no_ar_desde, linha.dias_no_ar) == (date(2026, 11, 6), 4)
    lancou_hoje = svc.linha_analise(
        player, "Principal", vt.StatsVsl(), vt.EngajamentoVsl(), no_ar_desde=date(2026, 11, 9), hoje=date(2026, 11, 9)
    )
    assert lancou_hoje.dias_no_ar == 1


def test_historico_comeca_na_criacao_da_vsl_no_fuso_de_brasilia():
    hoje = date(2026, 11, 9)
    # Criada 02h UTC do dia 9 = 23h do dia 8 em Brasília
    nova = vt.PlayerVturb(id="x", nome="VSL", duracao_seg=1882, criado_em="2026-11-09T02:00:00.000Z")
    h = svc._historico(nova, hoje)
    assert h.inicio == date(2026, 11, 8)
    assert h.consulta.caminho == "/sessions/stats_by_day"
    assert h.consulta.corpo["video_duration"] == 1882
    antiga = vt.PlayerVturb(id="y", nome="VSL", criado_em="2020-01-01T00:00:00Z")
    assert svc._historico(antiga, hoje).inicio == hoje - timedelta(days=365)
    sem_data = vt.PlayerVturb(id="z", nome="VSL", criado_em="lixo")
    assert svc._historico(sem_data, hoje).inicio == hoje - timedelta(days=365)


def test_porcentagem_arredonda_meio_pra_cima_como_a_vturb():
    assert svc._pct(207, 480) == 43.13  # 43,125
    assert svc._pct(1, 3) == 33.33
    assert svc._pct(5, 0) is None


# ============================================================
# Consultas, cache e HTTP
# ============================================================
def test_chave_da_consulta_independe_da_ordem_do_corpo():
    a = vt.Consulta("/x", {"b": 1, "a": 2})
    b = vt.Consulta("/x", {"a": 2, "b": 1})
    assert a.chave == b.chave


def test_periodo_vai_com_hora_e_fuso():
    corpo = vt.consulta_stats("p", INICIO, FIM).corpo
    assert corpo["start_date"] == "2026-11-02 00:00:00"
    assert corpo["end_date"] == "2026-11-08 23:59:59"
    assert corpo["timezone"] == "America/Sao_Paulo"


def test_stats_manda_duracao_e_pitch_quando_conhecidos():
    # sem video_duration a VTurb devolve série diária vazia pra players novos
    corpo = vt.consulta_stats("p", INICIO, FIM, por_dia=True, duracao_seg=1740, pitch_seg=1508).corpo
    assert corpo["video_duration"] == 1740 and corpo["pitch_time"] == 1508
    sem = vt.consulta_stats("p", INICIO, FIM, duracao_seg=None, pitch_seg=None).corpo
    assert "video_duration" not in sem and "pitch_time" not in sem


def test_painel_pede_a_serie_diaria_com_a_duracao_do_video():
    player = vt.PlayerVturb(id="p", nome="VSL", duracao_seg=1740, pitch_seg=1508)
    stats, por_dia, engajamento = svc._consultas_painel(player, INICIO, FIM)
    assert por_dia.caminho == "/sessions/stats_by_day"
    assert por_dia.corpo["video_duration"] == 1740
    assert engajamento.caminho == "/times/user_engagement"


def test_ttl_menor_quando_a_janela_inclui_hoje():
    assert vt.ttl_janela(vt.hoje_br()) == vt.TTL_COM_HOJE
    assert vt.ttl_janela(vt.hoje_br() - timedelta(days=1)) == vt.TTL_PASSADO


@pytest.fixture
def vturb_falsa(monkeypatch):
    """Troca a rede por um MockTransport. `respostas` = {caminho: (status, json)}."""
    pedidos: list[httpx.Request] = []

    def _instalar(respostas: dict[str, tuple[int, object]], token: str = "chave-teste"):
        monkeypatch.setattr(vt.settings, "VTURB_API_TOKEN", token)

        def _handler(req: httpx.Request) -> httpx.Response:
            pedidos.append(req)
            status, corpo = respostas[req.url.path]
            return httpx.Response(status, json=corpo)

        monkeypatch.setattr(vt, "_transport", httpx.MockTransport(_handler))
        return pedidos

    return _instalar


async def test_requisicao_manda_os_headers_da_vturb(vturb_falsa):
    pedidos = vturb_falsa({"/sessions/stats": (200, {"total_viewed": 1})})
    [resposta] = await vt._buscar_em_paralelo([vt.consulta_stats("p", INICIO, FIM)])
    assert resposta == {"total_viewed": 1}
    headers = pedidos[0].headers
    assert headers["X-Api-Token"] == "chave-teste"
    assert headers["X-Api-Version"] == "v1"
    assert headers["User-Agent"] == vt.USER_AGENT


@pytest.mark.parametrize(
    "status,trecho", [(401, "recusou a chave"), (429, "Limite de consultas"), (500, "erro 500")]
)
async def test_erros_http_viram_mensagem_em_portugues(vturb_falsa, status, trecho):
    vturb_falsa({"/sessions/stats": (status, {"error": "x"})})
    [erro] = await vt._buscar_em_paralelo([vt.consulta_stats("p", INICIO, FIM)])
    assert isinstance(erro, vt.VturbErro)
    assert trecho in str(erro)


async def test_sem_chave_nao_chama_a_vturb(vturb_falsa):
    pedidos = vturb_falsa({}, token="  ")
    with pytest.raises(vt.VturbNaoConfigurada):
        await vt._buscar_em_paralelo([vt.consulta_players()])
    assert pedidos == []


async def test_resolver_usa_cache_e_salva_o_que_deu_certo_antes_do_erro(vturb_falsa, monkeypatch):
    em_cache = vt.consulta_stats("cacheado", INICIO, FIM)
    ok = vt.consulta_stats("ok", INICIO, FIM, por_dia=True)
    falha = vt.consulta_cliques_por_tempo("falha", INICIO, FIM)
    gravados: list[str] = []

    async def _ler(db, chaves):
        return {em_cache.chave: {"total_viewed": 9}}

    async def _gravar(db, itens):
        gravados.extend(c.chave for c, _ in itens)

    monkeypatch.setattr(vt, "_ler_cache", _ler)
    monkeypatch.setattr(vt, "_gravar_cache", _gravar)
    pedidos = vturb_falsa({"/sessions/stats_by_day": (200, []), "/clicks/total_by_company_timed": (429, {})})

    with pytest.raises(vt.VturbErro, match="Limite"):
        await vt.resolver(None, [em_cache, ok, falha])
    assert gravados == [ok.chave]
    assert {p.url.path for p in pedidos} == {"/sessions/stats_by_day", "/clicks/total_by_company_timed"}
