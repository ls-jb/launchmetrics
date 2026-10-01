"""Testes do loop de conversa da Luzi com um cliente Anthropic falso
(sem chamar a API de verdade nem o banco)."""
from datetime import date
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

import pytest

from app.schemas.luzi import MensagemLuzi
from app.services import luzi_service
from app.services.luzi_dados_service import ContextoPerpetuo, OfertaInfo
from app.services.luzi_service import LuziErro

CTX = ContextoPerpetuo(uuid4(), "Agenda Cheia", date(2026, 8, 14), {"abc": OfertaInfo("Oferta Principal", "Principal")})


def _texto(t: str) -> SimpleNamespace:
    return SimpleNamespace(type="text", text=t)


def _tool_use(nome: str, entrada: dict[str, Any]) -> SimpleNamespace:
    return SimpleNamespace(type="tool_use", id=f"tu_{nome}", name=nome, input=entrada)


class _ClienteFalso:
    """Devolve as respostas roteirizadas, uma por chamada, e guarda os pedidos."""

    def __init__(self, respostas: list[SimpleNamespace]):
        self.respostas = respostas
        self.pedidos: list[dict[str, Any]] = []
        self.beta = SimpleNamespace(messages=SimpleNamespace(create=self._create))

    async def _create(self, **kwargs: Any) -> SimpleNamespace:
        self.pedidos.append({**kwargs, "messages": list(kwargs["messages"])})
        return self.respostas.pop(0)

    async def __aenter__(self) -> "_ClienteFalso":
        return self

    async def __aexit__(self, *exc: Any) -> None:
        return None


class _DbFalso:
    async def rollback(self) -> None:
        return None


@pytest.fixture
def preparar(monkeypatch):
    def _preparar(respostas: list[SimpleNamespace]) -> _ClienteFalso:
        cliente = _ClienteFalso(respostas)
        monkeypatch.setattr(luzi_service.settings, "ANTHROPIC_API_KEY", "chave-teste")
        monkeypatch.setattr(luzi_service.anthropic, "AsyncAnthropic", lambda **_: cliente)

        async def _ctx(db, pid):
            return CTX

        async def _resumo(db, ctx, entrada):
            return {"vendas": 3, "faturamento_bruto": 900.0}

        monkeypatch.setattr(luzi_service.dados, "carregar_contexto", _ctx)
        monkeypatch.setitem(luzi_service.HANDLERS, "resumo_periodo", _resumo)
        return cliente

    return _preparar


def _pergunta(texto: str = "quanto vendemos?") -> list[MensagemLuzi]:
    return [MensagemLuzi(papel="usuario", conteudo=texto)]


async def test_loop_executa_ferramenta_e_responde(preparar):
    cliente = preparar([
        SimpleNamespace(stop_reason="tool_use", content=[_tool_use("resumo_periodo", {})]),
        SimpleNamespace(stop_reason="end_turn", content=[_texto("Foram **3 vendas**.")]),
    ])
    resposta = await luzi_service.conversar(_DbFalso(), CTX.perpetuo_id, _pergunta(), None, None)
    assert resposta == "Foram **3 vendas**."
    assert len(cliente.pedidos) == 2
    resultado = cliente.pedidos[1]["messages"][-1]["content"][0]
    assert resultado["type"] == "tool_result"
    assert resultado["tool_use_id"] == "tu_resumo_periodo"
    assert '"vendas":3' in resultado["content"]
    assert resultado["is_error"] is False


async def test_system_tem_bloco_fixo_cacheado_e_contexto_do_perpetuo(preparar):
    cliente = preparar([SimpleNamespace(stop_reason="end_turn", content=[_texto("oi")])])
    await luzi_service.conversar(_DbFalso(), CTX.perpetuo_id, _pergunta(), date(2026, 9, 1), date(2026, 9, 30))
    fixo, contexto = cliente.pedidos[0]["system"]
    assert fixo["cache_control"] == {"type": "ephemeral"}
    assert "cache_control" not in contexto
    assert "Agenda Cheia" in contexto["text"]
    assert "01/09/2026 a 30/09/2026" in contexto["text"]


async def test_ferramenta_desconhecida_vira_erro_pro_modelo(preparar):
    cliente = preparar([
        SimpleNamespace(stop_reason="tool_use", content=[_tool_use("apagar_tudo", {})]),
        SimpleNamespace(stop_reason="end_turn", content=[_texto("Não consigo.")]),
    ])
    await luzi_service.conversar(_DbFalso(), CTX.perpetuo_id, _pergunta(), None, None)
    resultado = cliente.pedidos[1]["messages"][-1]["content"][0]
    assert resultado["is_error"] is True
    assert "desconhecida" in resultado["content"]


async def test_recusa_devolve_mensagem_amigavel(preparar):
    preparar([SimpleNamespace(stop_reason="refusal", content=[])])
    resposta = await luzi_service.conversar(_DbFalso(), CTX.perpetuo_id, _pergunta(), None, None)
    assert resposta == luzi_service.MSG_RECUSA


async def test_limite_de_rodadas(preparar):
    preparar([
        SimpleNamespace(stop_reason="tool_use", content=[_tool_use("resumo_periodo", {})])
        for _ in range(luzi_service.MAX_RODADAS)
    ])
    resposta = await luzi_service.conversar(_DbFalso(), CTX.perpetuo_id, _pergunta(), None, None)
    assert resposta == luzi_service.MSG_LIMITE


async def test_sem_chave_da_api_da_503(monkeypatch):
    monkeypatch.setattr(luzi_service.settings, "ANTHROPIC_API_KEY", "")
    with pytest.raises(LuziErro) as exc:
        await luzi_service.conversar(_DbFalso(), CTX.perpetuo_id, _pergunta(), None, None)
    assert exc.value.status_code == 503


def test_historico_descarta_luzi_no_inicio_e_exige_usuario_no_fim():
    mensagens = [
        MensagemLuzi(papel="luzi", conteudo="Olá!"),
        MensagemLuzi(papel="usuario", conteudo="oi"),
    ]
    assert luzi_service._historico(mensagens) == [{"role": "user", "content": "oi"}]
    with pytest.raises(LuziErro):
        luzi_service._historico([MensagemLuzi(papel="usuario", conteudo="a"), MensagemLuzi(papel="luzi", conteudo="b")])
