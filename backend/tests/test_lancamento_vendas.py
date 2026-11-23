"""Testes do dashboard de vendas dos lançamentos. Sem banco: regras de
seleção (oferta x produto inteiro), período, métricas e o SQL gerado."""
from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.schemas.lancamento import LancamentoCreate, LancamentoUpdate
from app.schemas.lancamento_vendas import OfertaVendida, VinculoOferta
from app.services import lancamento_vendas_service as svc
from app.services.lancamento_service import STATUS_INICIAL, calcular_metricas
from app.services.lancamento_vendas_service import TotaisVendas


def _oferta(codigo: str, produto: str = "Curso A", nome: str | None = None) -> VinculoOferta:
    return VinculoOferta(produto=produto, oferta_codigo=codigo, oferta_nome=nome)


def _produto(produto: str) -> VinculoOferta:
    return VinculoOferta(produto=produto)


def _vendida(codigo: str | None, receita: str, qtd: int = 1, produto: str = "Curso A") -> OfertaVendida:
    return OfertaVendida(
        produto=produto,
        oferta_codigo=codigo,
        oferta_nome=None,
        quantidade=qtd,
        receita=Decimal(receita),
    )


# ------------------------------------------------------------
# Seleção: oferta avulsa x produto inteiro
# ------------------------------------------------------------
def test_vinculo_precisa_de_produto_ou_oferta():
    with pytest.raises(ValidationError):
        VinculoOferta(produto="   ", oferta_codigo="")


def test_vinculo_corta_espacos_e_vazio_vira_none():
    v = VinculoOferta(produto="  Curso A ", oferta_codigo=" abc ", oferta_nome="  ")
    assert (v.produto, v.oferta_codigo, v.oferta_nome) == ("Curso A", "abc", None)


def test_separar_vinculos_distingue_oferta_de_produto_inteiro():
    codigos, produtos = svc.separar_vinculos(
        [_oferta("b"), _oferta("a"), _oferta("a"), _produto("Curso Z")]
    )
    assert codigos == ["a", "b"]
    # "Curso A" veio só como dono das ofertas — não vira produto inteiro.
    assert produtos == ["Curso Z"]


def test_deduplicar_remove_repetidos():
    itens = svc.deduplicar_itens([_oferta("a"), _oferta("a"), _produto("X"), _produto("X")])
    assert [(i.produto, i.oferta_codigo) for i in itens] == [("Curso A", "a"), ("X", None)]


def test_deduplicar_descarta_oferta_de_produto_ja_marcado_inteiro():
    itens = svc.deduplicar_itens(
        [_oferta("a", produto="Curso A"), _produto("Curso A"), _oferta("b", produto="Curso B")]
    )
    assert [(i.produto, i.oferta_codigo) for i in itens] == [
        ("Curso A", None),
        ("Curso B", "b"),
    ]


# ------------------------------------------------------------
# Tabela de ofertas e totais
# ------------------------------------------------------------
def test_completar_inclui_selecionadas_sem_venda_zeradas():
    linhas = svc.completar_com_vinculos(
        [_vendida("a", "100")], [_oferta("a"), _oferta("b", nome="Oferta B")]
    )
    assert [(l.oferta_codigo, l.quantidade, l.receita) for l in linhas] == [
        ("a", 1, Decimal("100")),
        ("b", 0, Decimal("0")),
    ]
    assert linhas[1].oferta_nome == "Oferta B"


def test_completar_ordena_por_receita_e_nao_duplica_oferta_vendida():
    linhas = svc.completar_com_vinculos(
        [_vendida("a", "50"), _vendida("b", "300", qtd=3)],
        [_oferta("a"), _oferta("b"), _oferta("b")],
    )
    assert [l.oferta_codigo for l in linhas] == ["b", "a"]


def test_completar_produto_inteiro_sem_venda_aparece_uma_vez():
    linhas = svc.completar_com_vinculos([], [_produto("Curso Z"), _produto("Curso Z")])
    assert [(l.produto, l.oferta_codigo, l.quantidade) for l in linhas] == [
        ("Curso Z", None, 0)
    ]


def test_completar_produto_inteiro_com_venda_nao_ganha_linha_extra():
    linhas = svc.completar_com_vinculos(
        [_vendida("x1", "80", produto="Curso Z")], [_produto("Curso Z")]
    )
    assert len(linhas) == 1


def test_agrupar_por_produto_soma_subtotal_e_ordena_por_receita():
    grupos = svc.agrupar_por_produto(
        [
            _vendida("a1", "100", qtd=2, produto="Curso A"),
            _vendida("a2", "50", produto="Curso A"),
            _vendida("z1", "900", qtd=3, produto="Curso Z"),
        ],
        [_oferta("a1"), _oferta("a2"), _produto("Curso Z")],
    )
    assert [(g.produto, g.inteiro, g.quantidade, g.receita) for g in grupos] == [
        ("Curso Z", True, 3, Decimal("900")),
        ("Curso A", False, 3, Decimal("150")),
    ]
    assert [o.oferta_codigo for o in grupos[1].ofertas] == ["a1", "a2"]


def test_agrupar_produto_inteiro_sem_venda_fica_sem_linha_de_oferta():
    vinculos = [_produto("Curso Z"), _oferta("a", nome="Oferta A")]
    grupos = svc.agrupar_por_produto(svc.completar_com_vinculos([], vinculos), vinculos)
    por_nome = {g.produto: g for g in grupos}
    assert por_nome["Curso Z"].ofertas == [] and por_nome["Curso Z"].inteiro
    # Oferta avulsa sem venda continua aparecendo, zerada.
    assert [o.oferta_codigo for o in por_nome["Curso A"].ofertas] == ["a"]


def test_totalizar_soma_quantidade_e_receita():
    totais = svc.totalizar([_vendida("a", "100.50", qtd=2), _vendida("b", "49.50")])
    assert totais == TotaisVendas(quantidade=3, receita=Decimal("150.00"))


def test_totalizar_vazio_e_zero():
    assert svc.totalizar([]) == TotaisVendas(quantidade=0, receita=Decimal("0"))


# ------------------------------------------------------------
# Período (horário de Brasília)
# ------------------------------------------------------------
def test_periodo_cobre_o_dia_inteiro_de_brasilia():
    inicio, fim = svc.periodo_utc(date(2026, 11, 20), date(2026, 11, 27))
    # 00:00 BRT = 03:00 UTC; o fim é exclusivo, no dia seguinte.
    assert inicio == datetime(2026, 11, 20, 3, 0, tzinfo=timezone.utc)
    assert fim == datetime(2026, 11, 28, 3, 0, tzinfo=timezone.utc)


def test_periodo_em_branco_nao_limita():
    assert svc.periodo_utc(None, None) == (None, None)
    inicio, fim = svc.periodo_utc(date(2026, 11, 20), None)
    assert inicio is not None and fim is None


# ------------------------------------------------------------
# Métricas (ROAS, ticket médio, CPL)
# ------------------------------------------------------------
def test_metricas_do_dash_de_vendas_usam_investimento_manual():
    m = calcular_metricas(
        tipo="vendas",
        investimento_canais=Decimal("999"),
        investimento_manual=Decimal("1000"),
        total_leads=0,
        vendas=TotaisVendas(quantidade=10, receita=Decimal("5000")),
    )
    assert m["investimento_total"] == Decimal("1000")
    assert m["receita_total"] == Decimal("5000")
    assert m["roas"] == Decimal("5")
    assert m["ticket_medio"] == Decimal("500")
    assert m["total_vendas"] == 10


def test_metricas_sem_investimento_e_sem_venda_nao_dividem_por_zero():
    m = calcular_metricas("vendas", Decimal("0"), Decimal("0"), 0, TotaisVendas())
    assert (m["roas"], m["ticket_medio"], m["cpl"]) == (Decimal("0"),) * 3


def test_metricas_do_dash_de_leads_continuam_como_antes():
    m = calcular_metricas(
        tipo="leads",
        investimento_canais=Decimal("2000"),
        investimento_manual=Decimal("777"),
        total_leads=400,
        vendas=None,
    )
    assert m["investimento_total"] == Decimal("2000")
    assert m["cpl"] == Decimal("5")
    assert (m["receita_total"], m["total_vendas"]) == (Decimal("0"), 0)


# ------------------------------------------------------------
# Schemas do lançamento
# ------------------------------------------------------------
def test_criar_sem_tipo_continua_sendo_dash_de_leads():
    dados = LancamentoCreate(nome="Black")
    assert (dados.tipo, dados.pasta_id, dados.investimento_manual) == ("leads", None, None)
    assert STATUS_INICIAL[dados.tipo] == "captacao"


def test_criar_dash_de_vendas_aceita_investimento_em_branco():
    dados = LancamentoCreate(nome="Black — vendas", tipo="vendas")
    assert STATUS_INICIAL[dados.tipo] == "carrinho"
    assert dados.investimento_manual is None


def test_tipo_invalido_e_recusado():
    with pytest.raises(ValidationError):
        LancamentoCreate(nome="X", tipo="outro")


def test_patch_de_pasta_null_explicito_tira_da_pasta():
    assert LancamentoUpdate(pasta_id=None).model_dump(exclude_unset=True) == {
        "pasta_id": None
    }
    # Não enviar o campo não mexe na pasta.
    assert "pasta_id" not in LancamentoUpdate(nome="X").model_dump(exclude_unset=True)


# ------------------------------------------------------------
# SQL gerado (compila pra Postgres, sem executar)
# ------------------------------------------------------------
def _sql(codigos: list[str], produtos: list[str], inicio=None, fim=None) -> str:
    sub = svc._vendas_efetivas(codigos, produtos, inicio, fim)
    return str(sub.select().compile(dialect=postgresql.dialect()))


def test_sql_filtra_oferta_ou_produto_e_aplica_regra_de_venda_real():
    sql = _sql(["a"], ["Curso Z"], date(2026, 11, 1), date(2026, 11, 30))
    assert "oferta_codigo IN" in sql and "produto IN" in sql
    assert " OR " in sql
    assert "row_number()" in sql and "rn = " in sql
    assert "ofertas_precos" in sql
    assert sql.count("data_venda >=") == 1 and sql.count("data_venda <") == 1


def test_sql_sem_datas_nao_filtra_periodo():
    sql = _sql(["a"], [])
    assert "data_venda >=" not in sql and "data_venda <" not in sql
    assert "produto IN" not in sql
