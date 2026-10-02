"""Testes das funções puras da planilha por perpétuo (linha e dedup)."""
import json
from datetime import datetime, timezone
from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.models import PerpetuoOferta, Venda
from app.schemas.perpetuo import PerpetuoUpdate
from app.services.planilha_perpetuo_service import montar_linha, selecionar_efetivas

OFERTA = PerpetuoOferta(oferta_codigo="abc", oferta_nome="Oferta Principal", categoria=None)


def _venda(**campos) -> Venda:
    base = dict(
        id=uuid4(),
        plataforma="Hotmart",
        external_id="HP123",
        produto="Agenda Cheia",
        oferta_nome="Agenda Cheia - Principal",
        oferta_codigo="abc",
        valor=Decimal("97.00"),
        status="aprovada",
        comprador_email="ana@x.com",
        data_venda=datetime(2026, 10, 2, 17, 30, tzinfo=timezone.utc),
        forcar_no_dash=False,
        recorrencia_seq=None,
        payload_bruto=None,
    )
    base.update(campos)
    return Venda(**base)


# ============================================================
# montar_linha
# ============================================================
def test_montar_linha_com_origem_json_agenda_cheia():
    xcod = {"co": "ADS_AC_62|5254", "vsrc": "paid_metaads", "url": "inlead.digital/agendacheia/?x=1"}
    payload = {"data": {"purchase": {"origin": {"xcod": json.dumps(xcod), "src": "v3"}}}}
    linha = montar_linha(_venda(payload_bruto=payload), OFERTA, Decimal("197.00"))

    assert linha["id_venda"] == "HP123"
    assert linha["data_hora"] == "2026-10-02T14:30:00-03:00"  # horário de Brasília
    assert linha["oferta"] == "Oferta Principal"
    assert linha["categoria"] == "Principal"
    assert linha["valor_bruto"] == 197.0  # valor da oferta, não o da venda
    assert linha["canal"] == "paid_metaads"
    assert linha["criativo"] == "ADS_AC_62"
    assert linha["anuncio_id"] == "5254"
    assert linha["pagina"] == "inlead.digital/agendacheia"
    assert linha["src"] == "v3"


def test_montar_linha_sem_origem_deixa_celulas_vazias():
    venda = _venda(external_id=None, plataforma="Manual")
    linha = montar_linha(venda, OFERTA, Decimal("97.00"))
    assert linha["id_venda"] == f"manual_{venda.id}"
    assert linha["canal"] == ""
    assert linha["campanha"] == ""
    assert linha["sck"] == ""


# ============================================================
# selecionar_efetivas (dedup igual ao dashboard)
# ============================================================
def test_dedup_descarta_segunda_compra_do_mesmo_email():
    v1 = _venda(external_id="A")
    v2 = _venda(external_id="B")
    efetivas = selecionar_efetivas([(v1, Decimal(1)), (v2, Decimal(1))])
    assert [v.external_id for v, _ in efetivas] == ["A"]


def test_forcar_no_dash_e_sem_email_sempre_entram():
    v1 = _venda(external_id="A")
    v2 = _venda(external_id="B", forcar_no_dash=True)
    v3 = _venda(external_id="C", comprador_email=None)
    v4 = _venda(external_id="D", comprador_email=None)
    efetivas = selecionar_efetivas([(v, Decimal(1)) for v in (v1, v2, v3, v4)])
    assert [v.external_id for v, _ in efetivas] == ["A", "B", "C", "D"]


# ============================================================
# Validação da URL
# ============================================================
def test_planilha_url_aceita_web_app_e_limpa_vazio():
    url = "https://script.google.com/macros/s/XYZ/exec"
    assert PerpetuoUpdate(planilha_url=f"  {url} ").planilha_url == url
    assert PerpetuoUpdate(planilha_url="").planilha_url is None


def test_planilha_url_recusa_link_da_planilha():
    with pytest.raises(ValidationError):
        PerpetuoUpdate(planilha_url="https://docs.google.com/spreadsheets/d/abc/edit")
