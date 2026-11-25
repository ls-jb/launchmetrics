"""
Blocos do topo do perpétuo (estrutura no estilo Ratoeira Ads).

Função pura: recebe as métricas por oferta (já calculadas no período) e o
custo de anúncios, devolve todos os blocos. Sem banco — fácil de testar.

Regras:
- Faturamento Líquido = o que a Hotmart repassa (commissions PRODUCER), já
  sem taxa da Hotmart e sem comissão de afiliado. Referência: "Receita
  Líquida" do relatório da Hotmart.
- Taxas Hotmart só informam quanto ficou com a Hotmart/afiliados — já saíram
  do líquido, por isso NÃO entram no Custo Total (senão desconta 2x).
- Taxa Meta (12,5%) incide sobre o gasto em anúncios; Taxa Empresa (5,93%)
  sobre o valor das vendas (preço pago pela oferta, sem juros do parcelamento).
- ROAS e CPA usam Anúncios + Taxa Meta (mesma base de custo da Ratoeira);
  a Taxa Empresa reduz só o Resultado.
- Front = categoria "Principal". CPA e Ticket Médio são por venda front.
"""
from decimal import ROUND_HALF_UP, Decimal
from typing import Iterable

from app.schemas.perpetuo import OfertaDetalhe, ResumoEtapa, ResumoPerpetuo

TAXA_META = Decimal("0.125")
"""Imposto sobre o gasto em anúncios da Meta."""
TAXA_EMPRESA = Decimal("0.0593")
"""Imposto da empresa sobre o valor das vendas."""
TAXA_HOTMART_PCT = Decimal("0.04")
TAXA_HOTMART_FIXA = Decimal("1")
"""Taxa da Hotmart (4% + R$ 1 por venda). Só usada como estimativa quando a
venda não traz o líquido real (vendas antigas / outra moeda)."""

CATEGORIA_FRONT = "Principal"
ORDEM_CATEGORIAS: tuple[str, ...] = (
    "Principal",
    "Order Bump",
    "Upsell",
    "UpUpsell",
    "Downsell",
    "Downsell 2",
    "Outros",
)

_CENTAVO = Decimal("0.01")
_ZERO = Decimal("0")


def _centavos(valor: Decimal) -> Decimal:
    return valor.quantize(_CENTAVO, rounding=ROUND_HALF_UP)


def _dividir(numerador: Decimal, denominador: Decimal | int) -> Decimal | None:
    """Divisão que devolve None quando não dá pra calcular (custo ou vendas 0)."""
    if not denominador:
        return None
    return Decimal(numerador) / Decimal(denominador)


def _somar(ofertas: Iterable[OfertaDetalhe], campo: str) -> Decimal:
    return sum((Decimal(getattr(o, campo)) for o in ofertas), _ZERO)


def _por_categoria(ofertas: list[OfertaDetalhe]) -> list[ResumoEtapa]:
    """Vendas e valor líquido por etapa do funil, na ordem do funil. Só as
    categorias que existem nas ofertas (mesmo com 0 venda no período)."""
    etapas: list[ResumoEtapa] = []
    for categoria in ORDEM_CATEGORIAS:
        da_categoria = [o for o in ofertas if o.categoria == categoria]
        if not da_categoria:
            continue
        etapas.append(
            ResumoEtapa(
                categoria=categoria,  # type: ignore[arg-type]
                quantidade=sum(o.quantidade for o in da_categoria),
                valor=_somar(da_categoria, "faturamento_liquido"),
            )
        )
    return etapas


def montar_resumo(
    ofertas: list[OfertaDetalhe],
    custo_anuncios: Decimal,
    categorias: set[str] | None = None,
) -> ResumoPerpetuo:
    """Monta os blocos. `categorias` = filtro "Considerar" da tela (None =
    todas). Vendas/faturamento/Taxa Empresa respeitam o filtro; anúncios e
    Taxa Meta são sempre o total do perpétuo."""
    ativas = [o for o in ofertas if categorias is None or o.categoria in categorias]
    liquido = _somar(ativas, "faturamento_liquido")
    valor_vendas = _somar(ativas, "valor_vendas")
    custo_anuncios = Decimal(custo_anuncios)

    taxa_meta = _centavos(custo_anuncios * TAXA_META)
    taxa_empresa = _centavos(valor_vendas * TAXA_EMPRESA)
    custo_midia = custo_anuncios + taxa_meta
    custo_total = custo_midia + taxa_empresa
    vendas_front = sum(o.quantidade for o in ativas if o.categoria == CATEGORIA_FRONT)

    return ResumoPerpetuo(
        faturamento_liquido=liquido,
        faturamento_bruto=_somar(ativas, "faturamento_bruto"),
        taxas_hotmart=valor_vendas - liquido,
        custo_anuncios=custo_anuncios,
        taxa_meta=taxa_meta,
        taxa_empresa=taxa_empresa,
        impostos_totais=taxa_meta + taxa_empresa,
        custo_total=custo_total,
        resultado=liquido - custo_total,
        roas=_dividir(liquido, custo_midia),
        cpa=_dividir(custo_midia, vendas_front),
        ticket_medio=_dividir(liquido, vendas_front),
        vendas_front=vendas_front,
        vendas_total=sum(o.quantidade for o in ativas),
        vendas_internacionais=sum(o.quantidade_internacional for o in ativas),
        liquido_internacional=_somar(ativas, "liquido_internacional"),
        pct_taxa_meta=TAXA_META,
        pct_taxa_empresa=TAXA_EMPRESA,
        por_categoria=_por_categoria(ativas),
    )
