"""Testes da extração do valor (em BRL) do payload da Hotmart."""
from decimal import Decimal

from app.services.hotmart_service import _extrair_valor


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
