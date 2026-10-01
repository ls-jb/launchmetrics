"""
Ferramentas (tools) que a Luzi pode chamar. Todas são SOMENTE LEITURA e
limitadas às ofertas do perpétuo da conversa — a IA nunca escreve SQL.

Cada ferramenta = schema JSON (enviado ao Claude) + handler async que
recebe o input já parseado e devolve um dict serializável.
"""
from collections.abc import Awaitable, Callable
from datetime import date, datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.services import luzi_dados_service as dados
from app.services.luzi_dados_service import ContextoPerpetuo
from app.services.perpetuo_service import BR_TZ

Handler = Callable[[AsyncSession, ContextoPerpetuo, dict[str, Any]], Awaitable[dict[str, Any]]]

_PERIODO: dict[str, Any] = {
    "inicio": {
        "type": "string",
        "description": "Data inicial AAAA-MM-DD (fuso de Brasília). Omitir = início do perpétuo.",
    },
    "fim": {
        "type": "string",
        "description": "Data final AAAA-MM-DD, inclusiva. Omitir = hoje.",
    },
}

_FILTROS: dict[str, Any] = {
    campo: {"type": "string", "description": f"Filtra por {campo} (valor exato, como aparece nos resultados)."}
    for campo in (
        "categoria", "oferta", "canal", "campanha", "conjunto", "criativo",
        "posicionamento", "pagina", "metodo_pagamento",
    )
}


# ============================================================
# Definições enviadas ao Claude
# ============================================================
FERRAMENTAS: list[dict[str, Any]] = [
    {
        "name": "resumo_periodo",
        "description": (
            "Resumo das vendas efetivas do perpétuo no período: quantidade, faturamento bruto, "
            "ticket médio, investimento em tráfego (aportes), ROAS bruto e totais por categoria."
        ),
        "input_schema": {"type": "object", "properties": {**_PERIODO}},
    },
    {
        "name": "vendas_agrupadas",
        "description": (
            "Agrupa as vendas efetivas por uma dimensão e devolve quantidade, faturamento, ticket "
            "médio e % do faturamento por grupo. Dimensões de origem: canal (fonte/utm_source, ex. "
            "paid_metaads ou FB), campanha, conjunto (de anúncios), criativo (nome/código do "
            "anúncio), anuncio (id do anúncio na Meta), posicionamento (ex. Facebook_Mobile_Feed), "
            "pagina (URL da página de venda) e referencia (site de onde veio, ex. instagram.com). "
            "Nem todo perpétuo tem todas: dimensão só com '(sem origem)' = dado não rastreado."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "dimensao": {"type": "string", "enum": list(dados.DIMENSOES)},
                **_PERIODO,
                **_FILTROS,
                "limite": {"type": "integer", "description": "Máximo de grupos (padrão 20, máx. 100)."},
            },
            "required": ["dimensao"],
        },
    },
    {
        "name": "listar_vendas",
        "description": "Lista vendas efetivas individuais (data, oferta, valor, comprador, origem).",
        "input_schema": {
            "type": "object",
            "properties": {
                **_PERIODO,
                **_FILTROS,
                "ordenar_por": {"type": "string", "enum": ["recentes", "maior_valor"]},
                "limite": {"type": "integer", "description": "Máximo de vendas (padrão 20, máx. 50)."},
            },
        },
    },
    {
        "name": "buscar_comprador",
        "description": "Busca compras (qualquer status) de um comprador por parte do email ou do nome.",
        "input_schema": {
            "type": "object",
            "properties": {"termo": {"type": "string", "description": "Email ou nome (ou parte)."}},
            "required": ["termo"],
        },
    },
    {
        "name": "reembolsos_e_cancelamentos",
        "description": "Quantidade e valor de vendas reembolsadas, canceladas e pendentes no período.",
        "input_schema": {"type": "object", "properties": {**_PERIODO}},
    },
    {
        "name": "taxa_conversao_ofertas",
        "description": (
            "Dos compradores da oferta Principal no período, quantos (e qual %) também compraram "
            "Upsell, Downsell, Order Bump etc."
        ),
        "input_schema": {"type": "object", "properties": {**_PERIODO}},
    },
]


# ============================================================
# Handlers
# ============================================================
def periodo(ctx: ContextoPerpetuo, entrada: dict[str, Any]) -> tuple[date, date]:
    """Converte inicio/fim do input; padrão = início do perpétuo até hoje (BRT)."""
    hoje = datetime.now(BR_TZ).date()
    inicio = _data(entrada.get("inicio")) or ctx.data_inicio
    fim = _data(entrada.get("fim")) or hoje
    if inicio > fim:
        inicio, fim = fim, inicio
    return inicio, fim


def _data(valor: Any) -> date | None:
    if not valor:
        return None
    try:
        return date.fromisoformat(str(valor)[:10])
    except ValueError as exc:
        raise ValueError(f"Data inválida '{valor}'. Use AAAA-MM-DD.") from exc


def _limite(entrada: dict[str, Any], padrao: int, maximo: int) -> int:
    try:
        return max(1, min(int(entrada.get("limite") or padrao), maximo))
    except (TypeError, ValueError):
        return padrao


async def _vendas_filtradas(
    db: AsyncSession, ctx: ContextoPerpetuo, entrada: dict[str, Any]
) -> tuple[date, date, list[dados.VendaLuzi]]:
    inicio, fim = periodo(ctx, entrada)
    vendas = await dados.carregar_vendas(db, ctx, inicio, fim)
    filtros = {campo: entrada.get(campo) for campo in _FILTROS}
    return inicio, fim, dados.filtrar(vendas, filtros)


async def _resumo_periodo(db: AsyncSession, ctx: ContextoPerpetuo, entrada: dict[str, Any]) -> dict[str, Any]:
    inicio, fim = periodo(ctx, entrada)
    vendas = await dados.carregar_vendas(db, ctx, inicio, fim)
    investimento = await dados.investimento_periodo(db, ctx, inicio, fim)
    return {"periodo": [inicio.isoformat(), fim.isoformat()], **dados.resumo(vendas, investimento)}


async def _vendas_agrupadas(db: AsyncSession, ctx: ContextoPerpetuo, entrada: dict[str, Any]) -> dict[str, Any]:
    dimensao = str(entrada.get("dimensao") or "")
    if dimensao not in dados.DIMENSOES:
        raise ValueError(f"Dimensão inválida '{dimensao}'. Opções: {', '.join(dados.DIMENSOES)}.")
    inicio, fim, vendas = await _vendas_filtradas(db, ctx, entrada)
    grupos = dados.agrupar(vendas, dimensao)
    return {
        "periodo": [inicio.isoformat(), fim.isoformat()],
        "dimensao": dimensao,
        "total_vendas": len(vendas),
        "total_grupos": len(grupos),
        "grupos": grupos[: _limite(entrada, 20, 100)],
    }


async def _listar_vendas(db: AsyncSession, ctx: ContextoPerpetuo, entrada: dict[str, Any]) -> dict[str, Any]:
    inicio, fim, vendas = await _vendas_filtradas(db, ctx, entrada)
    if entrada.get("ordenar_por") == "maior_valor":
        vendas = sorted(vendas, key=lambda v: v.valor, reverse=True)
    else:
        vendas = sorted(vendas, key=lambda v: v.data_venda, reverse=True)
    return {
        "periodo": [inicio.isoformat(), fim.isoformat()],
        "total_no_filtro": len(vendas),
        "vendas": [dados.venda_para_dict(v) for v in vendas[: _limite(entrada, 20, 50)]],
    }


async def _buscar_comprador(db: AsyncSession, ctx: ContextoPerpetuo, entrada: dict[str, Any]) -> dict[str, Any]:
    compras = await dados.buscar_comprador(db, ctx, str(entrada.get("termo") or ""))
    return {"compras": compras}


async def _reembolsos(db: AsyncSession, ctx: ContextoPerpetuo, entrada: dict[str, Any]) -> dict[str, Any]:
    inicio, fim = periodo(ctx, entrada)
    return {
        "periodo": [inicio.isoformat(), fim.isoformat()],
        "por_status": await dados.nao_aprovadas(db, ctx, inicio, fim),
    }


async def _conversao(db: AsyncSession, ctx: ContextoPerpetuo, entrada: dict[str, Any]) -> dict[str, Any]:
    inicio, fim = periodo(ctx, entrada)
    vendas = await dados.carregar_vendas(db, ctx, inicio, fim)
    return {"periodo": [inicio.isoformat(), fim.isoformat()], **dados.conversao_ofertas(vendas)}


HANDLERS: dict[str, Handler] = {
    "resumo_periodo": _resumo_periodo,
    "vendas_agrupadas": _vendas_agrupadas,
    "listar_vendas": _listar_vendas,
    "buscar_comprador": _buscar_comprador,
    "reembolsos_e_cancelamentos": _reembolsos,
    "taxa_conversao_ofertas": _conversao,
}
