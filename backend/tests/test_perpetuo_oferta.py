"""Testes da edição de ofertas do perpétuo — funil, explicação (?) e
oculta. Sem banco: só a normalização dos campos do PATCH e os schemas."""
from decimal import Decimal
from uuid import uuid4

from app.schemas.perpetuo import OfertaDetalhe, OfertaUpdate
from app.services.perpetuo_service import _normalizar_campos_oferta


def _campos_enviados(**payload) -> dict:
    """Simula o que a rota repassa ao service: só os campos enviados."""
    return OfertaUpdate(**payload).model_dump(exclude_unset=True)


def test_so_categoria_continua_funcionando_como_antes():
    assert _normalizar_campos_oferta(_campos_enviados(categoria="Upsell")) == {
        "categoria": "Upsell"
    }


def test_categoria_null_explicito_limpa_a_categoria():
    assert _normalizar_campos_oferta(_campos_enviados(categoria=None)) == {
        "categoria": None
    }


def test_campos_nao_enviados_nao_mudam():
    assert _normalizar_campos_oferta(_campos_enviados(oculta=True)) == {"oculta": True}


def test_texto_tem_espacos_cortados_e_vazio_limpa():
    campos = _campos_enviados(funil="  Funil Especial  ", descricao="   ")
    assert _normalizar_campos_oferta(campos) == {
        "funil": "Funil Especial",
        "descricao": None,
    }


def test_oculta_null_e_ignorado():
    assert _normalizar_campos_oferta(_campos_enviados(oculta=None)) == {}


def test_detalhe_sem_campos_novos_vem_visivel_e_sem_funil():
    d = OfertaDetalhe(
        id=uuid4(),
        oferta_codigo="abc",
        categoria="Principal",
        quantidade=1,
        receita=Decimal("10"),
    )
    assert (d.funil, d.descricao, d.oculta) == (None, None, False)
