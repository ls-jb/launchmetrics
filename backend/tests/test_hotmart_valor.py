"""Testes da extração do valor (em BRL) do payload da Hotmart."""
from decimal import Decimal

from app.services.hotmart_service import (
    _extrair_bruto,
    _extrair_liquido,
    _extrair_valor,
)


def test_compra_em_brl_usa_price():
    purchase = {
        "price": {"value": 308.47, "currency_value": "BRL"},
        "full_price": {"value": 356.28, "currency_value": "BRL"},
        "original_offer_price": {"value": 308.47, "currency_value": "BRL"},
    }
    assert _extrair_valor(purchase) == Decimal("308.47")


def test_compra_estrangeira_usa_original_offer_price_em_brl():
    purchase = {
        "price": {"value": 351969, "currency_value": "PYG"},
        "full_price": {"value": 351969, "currency_value": "PYG"},
        "original_offer_price": {"value": 313.34, "currency_value": "BRL"},
    }
    assert _extrair_valor(purchase) == Decimal("313.34")


def test_compra_em_euro_nao_fica_subestimada():
    purchase = {
        "price": {"value": 54, "currency_value": "EUR"},
        "original_offer_price": {"value": 316.46, "currency_value": "BRL"},
    }
    assert _extrair_valor(purchase) == Decimal("316.46")


def test_sem_moeda_assume_brl():
    assert _extrair_valor({"price": {"value": 97}}) == Decimal("97")


def test_sem_price_cai_no_full_price():
    assert _extrair_valor({"full_price": {"value": 150.01}}) == Decimal("150.01")


def test_payload_vazio_vira_zero():
    assert _extrair_valor({}) == Decimal("0")


# ------------------------------------------------------------
# Líquido (commissions PRODUCER) e bruto (full_price)
# ------------------------------------------------------------
def _comissao(source: str, valor: float, moeda: str = "BRL") -> dict:
    return {"source": source, "value": valor, "currency_value": moeda}


def test_liquido_e_a_comissao_do_produtor():
    data = {"commissions": [_comissao("MARKETPLACE", 12.88), _comissao("PRODUCER", 284.12)]}
    assert _extrair_liquido(data) == Decimal("284.12")


def test_liquido_com_afiliado_ja_vem_sem_a_comissao_dele():
    # Venda de R$ 308,47 com afiliado: Hotmart 13,34 + afiliado 88,54
    data = {"commissions": [_comissao("MARKETPLACE", 13.34), _comissao("PRODUCER", 206.59)]}
    assert _extrair_liquido(data) == Decimal("206.59")


def test_liquido_em_outra_moeda_vira_none():
    data = {"commissions": [_comissao("PRODUCER", 55.1, "USD")]}
    assert _extrair_liquido(data) is None


def test_liquido_sem_commissions_vira_none():
    assert _extrair_liquido({}) is None
    assert _extrair_liquido({"commissions": None}) is None
    assert _extrair_liquido({"commissions": [_comissao("MARKETPLACE", 12.88)]}) is None


def test_liquido_sem_moeda_assume_brl():
    assert _extrair_liquido({"commissions": [{"source": "PRODUCER", "value": 97}]}) == Decimal("97")


def test_bruto_e_o_full_price_com_juros():
    purchase = {
        "price": {"value": 308.47, "currency_value": "BRL"},
        "full_price": {"value": 356.28, "currency_value": "BRL"},
    }
    assert _extrair_bruto(purchase) == Decimal("356.28")


def test_bruto_em_outra_moeda_vira_none():
    assert _extrair_bruto({"full_price": {"value": 54, "currency_value": "EUR"}}) is None


def test_bruto_sem_full_price_vira_none():
    assert _extrair_bruto({}) is None


# ------------------------------------------------------------
# Venda internacional: Hotmart manda a conversão pra BRL na comissão
# (venda real de 25/11: US$ 54, líquido US$ 51,34 → R$ 303,40)
# ------------------------------------------------------------
def _dados_venda_dolar() -> dict:
    return {
        "commissions": [
            {"value": 2.66, "source": "MARKETPLACE", "currency_value": "USD"},
            {
                "value": 51.34,
                "source": "PRODUCER",
                "currency_value": "USD",
                "currency_conversion": {
                    "conversion_rate": 5.909599,
                    "converted_value": 303.4,
                    "converted_to_currency": "BRL",
                },
            },
        ]
    }


def test_liquido_em_dolar_usa_a_conversao_da_hotmart():
    assert _extrair_liquido(_dados_venda_dolar()) == Decimal("303.4")


def test_bruto_em_dolar_converte_pelo_cambio_da_hotmart():
    purchase = {"full_price": {"value": 57.43, "currency_value": "USD"}}
    # 57,43 × 5,909599 = 339,388... → 339,39
    assert _extrair_bruto(purchase, _dados_venda_dolar()) == Decimal("339.39")


def test_bruto_em_dolar_sem_cambio_vira_none():
    purchase = {"full_price": {"value": 57.43, "currency_value": "USD"}}
    assert _extrair_bruto(purchase, {}) is None
