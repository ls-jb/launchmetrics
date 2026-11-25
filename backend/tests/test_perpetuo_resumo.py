"""Blocos do topo do perpétuo — números reais do Arquétipos da Riqueza em
24/11/2026 (Hotmart: 72 vendas, Receita Líquida R$ 21.874,39). Sem banco."""
from decimal import Decimal
from uuid import uuid4

from app.schemas.perpetuo import OfertaDetalhe
from app.services.perpetuo_resumo_service import montar_resumo

CUSTO_ANUNCIOS = Decimal("12326.39")


def _oferta(categoria: str, qtd: int, liquido: str, valor: str, bruto: str) -> OfertaDetalhe:
    return OfertaDetalhe(
        id=uuid4(),
        oferta_codigo=f"cod-{categoria}",
        categoria=categoria,  # type: ignore[arg-type]
        quantidade=qtd,
        receita=Decimal(valor),
        faturamento_liquido=Decimal(liquido),
        valor_vendas=Decimal(valor),
        faturamento_bruto=Decimal(bruto),
    )


def _ofertas_24_11() -> list[OfertaDetalhe]:
    return [
        _oferta("Principal", 59, "16201.25", "17209.16", "18596.48"),
        _oferta("Upsell", 7, "4208.42", "4391.06", "4941.42"),
        _oferta("UpUpsell", 2, "376.24", "394.00", "424.52"),
        _oferta("Downsell", 4, "1088.48", "1138.00", "1248.52"),
    ]


def test_liquido_bate_com_a_hotmart():
    r = montar_resumo(_ofertas_24_11(), CUSTO_ANUNCIOS)
    assert r.faturamento_liquido == Decimal("21874.39")
    assert r.faturamento_bruto == Decimal("25210.94")
    assert r.vendas_total == 72


def test_taxas_e_impostos():
    r = montar_resumo(_ofertas_24_11(), CUSTO_ANUNCIOS)
    assert r.taxas_hotmart == Decimal("1257.83")  # Ratoeira: 1.256,21
    assert r.taxa_meta == Decimal("1540.80")  # 12,5% do gasto
    assert r.taxa_empresa == Decimal("1371.74")  # 5,93% de 23.132,22
    assert r.impostos_totais == Decimal("2912.54")


def test_custo_total_nao_desconta_a_taxa_hotmart_de_novo():
    r = montar_resumo(_ofertas_24_11(), CUSTO_ANUNCIOS)
    assert r.custo_total == Decimal("15238.93")  # anúncios + impostos
    assert r.resultado == Decimal("6635.46")


def test_roas_cpa_e_ticket_usam_anuncios_mais_taxa_meta_e_vendas_front():
    r = montar_resumo(_ofertas_24_11(), CUSTO_ANUNCIOS)
    assert r.vendas_front == 59
    assert round(r.roas, 2) == Decimal("1.58")  # 21.874,39 / 13.867,19
    assert round(r.cpa, 2) == Decimal("235.04")  # 13.867,19 / 59
    assert round(r.ticket_medio, 2) == Decimal("370.75")  # 21.874,39 / 59


def test_por_categoria_na_ordem_do_funil():
    r = montar_resumo(_ofertas_24_11(), CUSTO_ANUNCIOS)
    assert [(e.categoria, e.quantidade, e.valor) for e in r.por_categoria] == [
        ("Principal", 59, Decimal("16201.25")),
        ("Upsell", 7, Decimal("4208.42")),
        ("UpUpsell", 2, Decimal("376.24")),
        ("Downsell", 4, Decimal("1088.48")),
    ]


def test_filtro_de_categorias_mantem_o_custo_de_anuncios_inteiro():
    r = montar_resumo(_ofertas_24_11(), CUSTO_ANUNCIOS, {"Principal"})
    assert r.faturamento_liquido == Decimal("16201.25")
    assert r.vendas_total == 59
    assert r.custo_anuncios == CUSTO_ANUNCIOS
    assert r.taxa_meta == Decimal("1540.80")
    assert r.taxa_empresa == Decimal("1020.50")  # 5,93% de 17.209,16
    assert [e.categoria for e in r.por_categoria] == ["Principal"]


def test_sem_custo_e_sem_venda_front_nao_divide_por_zero():
    r = montar_resumo([_oferta("Upsell", 1, "100", "100", "100")], Decimal("0"))
    assert r.roas is None
    assert r.cpa is None
    assert r.ticket_medio is None
    assert r.resultado == Decimal("94.07")  # 100 − 5,93


def test_perpetuo_sem_ofertas():
    r = montar_resumo([], Decimal("500"))
    assert r.faturamento_liquido == Decimal("0")
    assert r.resultado == Decimal("-562.50")  # 500 + 12,5%
    assert r.por_categoria == []
