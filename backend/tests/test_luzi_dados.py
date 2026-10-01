"""Testes das funções puras da Luzi (origem da venda e agregações)."""
import json
from datetime import datetime
from decimal import Decimal

import pytest

from app.services.luzi_dados_service import (
    SEM_ORIGEM,
    OrigemVenda,
    VendaLuzi,
    agrupar,
    conversao_ofertas,
    extrair_origem,
    filtrar,
    resumo,
)
from app.services.luzi_ferramentas import periodo
from app.services.luzi_dados_service import ContextoPerpetuo
from app.services.perpetuo_service import BR_TZ


# ============================================================
# extrair_origem
# ============================================================
def test_extrair_origem_xcod_completo():
    xcod = {
        "co": "ADS_AC_62|52540405344096",
        "vid": "52540405344096",
        "vsrc": "paid_metaads",
        "u": "c001d243",
        "url": "inlead.digital/agendacheia/?fbclid=abc",
        "r": "instagram.com/",
    }
    origem = extrair_origem({"src": "v3_abc", "xcod": json.dumps(xcod)})
    assert origem.canal == "paid_metaads"
    assert origem.criativo == "ADS_AC_62"
    assert origem.anuncio_id == "52540405344096"
    assert origem.pagina == "inlead.digital/agendacheia"
    assert origem.referencia == "instagram.com"
    assert origem.src == "v3_abc"
    assert origem.sck is None


def test_extrair_origem_sem_co_usa_sem_origem():
    xcod = {"u": "x", "url": "brilhaprosperidade.com.br/upsell-1-aci/", "r": "hotmart.com/", "v": 1}
    origem = extrair_origem({"xcod": json.dumps(xcod)})
    assert origem.canal == SEM_ORIGEM
    assert origem.criativo == SEM_ORIGEM
    assert origem.anuncio_id == SEM_ORIGEM
    assert origem.pagina == "brilhaprosperidade.com.br/upsell-1-aci"


def test_extrair_origem_co_sem_vid_pega_anuncio_do_co():
    origem = extrair_origem({"xcod": json.dumps({"co": "ADS_AC_21|999"})})
    assert origem.criativo == "ADS_AC_21"
    assert origem.anuncio_id == "999"


@pytest.mark.parametrize("origin", [None, {}, {"xcod": ""}, {"xcod": "isso não é json"}, {"xcod": "[1,2]"}, "texto"])
def test_extrair_origem_invalida_nunca_quebra(origin):
    origem = extrair_origem(origin)  # type: ignore[arg-type]
    assert origem.canal == SEM_ORIGEM
    assert origem.criativo == SEM_ORIGEM
    assert origem.pagina == SEM_ORIGEM


# ============================================================
# agrupar / resumo / filtrar / conversão
# ============================================================
def _venda(valor: str, categoria: str = "Principal", canal: str = "paid_metaads",
           dia: int = 1, hora: int = 10, email: str | None = "a@x.com") -> VendaLuzi:
    origem = OrigemVenda(canal, "ADS_1", SEM_ORIGEM, SEM_ORIGEM, SEM_ORIGEM, None, None)
    return VendaLuzi(
        data_venda=datetime(2026, 9, dia, hora, tzinfo=BR_TZ),
        oferta_codigo=categoria.lower(),
        oferta_nome=f"Oferta {categoria}",
        categoria=categoria,
        valor=Decimal(valor),
        plataforma="Hotmart",
        comprador_nome="Fulano",
        comprador_email=email,
        metodo_pagamento="pix",
        origem=origem,
    )


def test_agrupar_por_canal_soma_e_ordena_por_faturamento():
    vendas = [_venda("100"), _venda("50", canal="Bio"), _venda("200"), _venda("30", canal="Bio")]
    grupos = agrupar(vendas, "canal")
    assert [g["grupo"] for g in grupos] == ["paid_metaads", "Bio"]
    assert grupos[0] == {
        "grupo": "paid_metaads", "quantidade": 2, "faturamento": 300.0,
        "ticket_medio": 150.0, "pct_faturamento": 78.9,
    }
    assert grupos[1]["quantidade"] == 2
    assert grupos[1]["ticket_medio"] == 40.0


def test_agrupar_por_dia_em_ordem_cronologica():
    vendas = [_venda("10", dia=3), _venda("999", dia=1), _venda("5", dia=2)]
    assert [g["grupo"] for g in agrupar(vendas, "dia")] == ["2026-09-01", "2026-09-02", "2026-09-03"]


def test_agrupar_dimensao_invalida():
    with pytest.raises(ValueError):
        agrupar([_venda("10")], "cor_favorita")


def test_agrupar_vazio():
    assert agrupar([], "canal") == []


def test_resumo_calcula_ticket_e_roas():
    r = resumo([_venda("100"), _venda("300", categoria="Upsell")], Decimal("200"))
    assert r["vendas"] == 2
    assert r["faturamento_bruto"] == 400.0
    assert r["ticket_medio"] == 200.0
    assert r["roas_bruto"] == 2.0
    assert {g["grupo"] for g in r["por_categoria"]} == {"Principal", "Upsell"}


def test_resumo_sem_investimento_nao_divide_por_zero():
    r = resumo([], Decimal("0"))
    assert r["vendas"] == 0
    assert r["ticket_medio"] == 0.0
    assert r["roas_bruto"] is None


def test_filtrar_ignora_maiusculas_e_filtros_vazios():
    vendas = [_venda("10", canal="Bio"), _venda("20")]
    assert len(filtrar(vendas, {"canal": "bio", "categoria": None})) == 1
    assert len(filtrar(vendas, {"canal": None})) == 2


def test_conversao_ofertas_por_email():
    vendas = [
        _venda("100", email="a@x.com"), _venda("100", email="b@x.com"),
        _venda("50", categoria="Upsell", email="A@x.com"),
        _venda("50", categoria="Upsell", email="zz@x.com"),  # não comprou a principal
    ]
    c = conversao_ofertas(vendas)
    assert c["compradores_principal"] == 2
    assert c["conversao_por_categoria"]["Upsell"] == {"compradores": 1, "pct_dos_compradores_principal": 50.0}


# ============================================================
# periodo (ferramentas)
# ============================================================
def _ctx() -> ContextoPerpetuo:
    from datetime import date
    from uuid import uuid4
    return ContextoPerpetuo(uuid4(), "Teste", date(2026, 8, 14), {})


def test_periodo_padrao_comeca_no_inicio_do_perpetuo():
    inicio, fim = periodo(_ctx(), {})
    assert inicio.isoformat() == "2026-08-14"
    assert fim >= inicio


def test_periodo_invertido_e_corrigido():
    inicio, fim = periodo(_ctx(), {"inicio": "2026-09-10", "fim": "2026-09-01"})
    assert (inicio.isoformat(), fim.isoformat()) == ("2026-09-01", "2026-09-10")


def test_periodo_data_invalida():
    with pytest.raises(ValueError):
        periodo(_ctx(), {"inicio": "ontem"})
