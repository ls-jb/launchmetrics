"""
Luzi — assistente de IA de vendas (Claude, API da Anthropic).

Fluxo: o frontend manda o histórico da conversa → o Claude decide quais
ferramentas (somente leitura, ver `luzi_ferramentas`) chamar → executamos e
devolvemos os resultados → repete até a resposta final (máx. MAX_RODADAS).
O histórico não é salvo no banco.
"""
import asyncio
import json
import logging
from datetime import date, datetime
from typing import Any
from uuid import UUID

import anthropic
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.schemas.luzi import MensagemLuzi
from app.services import luzi_dados_service as dados
from app.services.luzi_dados_service import ContextoPerpetuo
from app.services.luzi_ferramentas import FERRAMENTAS, HANDLERS
from app.services.perpetuo_service import BR_TZ

logger = logging.getLogger(__name__)

MAX_RODADAS = 6
TEMPO_MAXIMO_S = 50  # abaixo do maxDuration de 60s da Vercel
MAX_CHARS_RESULTADO = 20_000
ESFORCO = "medium"
# Se o modelo recusar por política, a API refaz o pedido num modelo
# alternativo automaticamente (server-side fallback).
BETAS = ["server-side-fallback-2026-07-01"]

MSG_RECUSA = "Desculpe, não consigo ajudar com esse pedido. Tente perguntar de outro jeito."
MSG_LIMITE = (
    "Precisei de consultas demais pra responder isso. "
    "Pode dividir a pergunta em partes menores?"
)

SYSTEM_FIXO = """Você é a Luzi, assistente de análise de vendas da equipe, dentro do dashboard LaunchMetrics.
Você responde perguntas sobre as vendas Hotmart de UM produto perpétuo (as ofertas estão listadas no contexto abaixo).

## Regras
- Sempre consulte as ferramentas antes de citar qualquer número. Nunca invente nem estime valores; se a ferramenta não traz o dado, diga que não tem essa informação.
- Você só lê dados. Não consegue reembolsar, cancelar, editar nem cadastrar nada — se pedirem, explique isso.
- Se perguntarem de outro produto ou de assuntos fora das vendas, diga que por enquanto você só responde sobre este perpétuo.
- Não mostre emails de compradores, a não ser quando perguntarem por um comprador específico.

## Como os números são calculados
- "Vendas" = vendas efetivas, com a MESMA regra do dashboard: status aprovada, só a 1ª cobrança de assinaturas, sem duplicar o mesmo email na mesma oferta, e valor com ajuste manual de preço quando houver.
- Faturamento é BRUTO (antes da taxa Hotmart e de impostos). Os cards do dashboard mostram valores líquidos (descontam taxa Hotmart de 4% + R$ 1 por venda e impostos), então podem ser menores — explique isso se o usuário comparar.
- ROAS bruto = faturamento bruto ÷ investimento em tráfego (aportes cadastrados no perpétuo).
- Reembolsos/cancelamentos/pendentes vêm de outra ferramenta e não entram nas vendas efetivas.

## Origem das vendas
A Hotmart não envia UTMs para essas vendas. A origem vem do rastreamento da página (campo xcod):
- canal: fonte do tráfego (ex.: paid_metaads = anúncio pago na Meta; Bio = link da bio; organic_comercial = orgânico/comercial)
- criativo: código do anúncio/criativo (ex.: ADS_AC_21)
- anuncio: id do anúncio na Meta
- pagina: página de venda onde a pessoa comprou
- referencia: site de onde a pessoa veio (ex.: instagram.com, m.facebook.com)
"(sem origem)" = venda sem rastreamento. Se pedirem "UTM", use esses campos e explique em uma frase.

## Datas
Tudo no fuso de Brasília. Interprete "hoje", "ontem", "essa semana" (segunda a domingo), "mês passado" etc. a partir da data de hoje informada no contexto. Se o usuário não disser o período, use o período filtrado no dashboard (também no contexto) e diga qual período usou.

## Formato da resposta
- Português do Brasil. Dinheiro como R$ 1.234,56; números com ponto de milhar.
- Comece pela resposta direta, em uma ou duas frases.
- Para listas, rankings e relatórios use tabela em markdown. Em relatórios: título curto, tabela(s) e 2 ou 3 observações úteis.
- Seja objetiva. Sem enrolação."""


class LuziErro(Exception):
    """Erro com mensagem amigável pro usuário e status HTTP."""

    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def habilitada(perpetuo_id: UUID) -> bool:
    return str(perpetuo_id).lower() in settings.luzi_perpetuos_list


async def conversar(
    db: AsyncSession,
    perpetuo_id: UUID,
    mensagens: list[MensagemLuzi],
    inicio: date | None,
    fim: date | None,
) -> str:
    if not settings.ANTHROPIC_API_KEY:
        raise LuziErro(503, "A Luzi ainda não foi configurada (falta a chave da API da Anthropic).")
    ctx = await dados.carregar_contexto(db, perpetuo_id)
    if not ctx:
        raise LuziErro(404, "Perpétuo não encontrado.")
    historico = _historico(mensagens)
    try:
        return await asyncio.wait_for(
            _rodar(db, ctx, historico, inicio, fim), timeout=TEMPO_MAXIMO_S
        )
    except TimeoutError as exc:
        raise LuziErro(504, "A Luzi demorou demais pra responder. Tente uma pergunta mais direta.") from exc
    except anthropic.APIError as exc:
        raise _traduzir_erro(exc) from exc


async def _rodar(
    db: AsyncSession,
    ctx: ContextoPerpetuo,
    historico: list[dict[str, Any]],
    inicio: date | None,
    fim: date | None,
) -> str:
    system = _system(ctx, inicio, fim)
    cabecalhos = (
        {"anthropic-workspace-id": settings.ANTHROPIC_WORKSPACE_ID}
        if settings.ANTHROPIC_WORKSPACE_ID
        else None
    )
    async with anthropic.AsyncAnthropic(
        api_key=settings.ANTHROPIC_API_KEY,
        timeout=45.0,
        max_retries=1,
        default_headers=cabecalhos,
    ) as client:
        for _ in range(MAX_RODADAS):
            resposta = await client.beta.messages.create(
                model=settings.LUZI_MODEL,
                max_tokens=16000,
                system=system,
                tools=FERRAMENTAS,
                messages=historico,
                output_config={"effort": ESFORCO},
                betas=BETAS,
                fallbacks="default",
            )
            if resposta.stop_reason == "refusal":
                return MSG_RECUSA
            if resposta.stop_reason != "tool_use":
                return _texto_final(resposta)
            historico.append({"role": "assistant", "content": resposta.content})
            historico.append({"role": "user", "content": await _executar_ferramentas(db, ctx, resposta.content)})
    return MSG_LIMITE


# ============================================================
# Montagem do pedido
# ============================================================
def _historico(mensagens: list[MensagemLuzi]) -> list[dict[str, Any]]:
    """Converte o histórico do frontend pro formato da API. A conversa
    precisa começar e terminar com mensagem do usuário."""
    papeis = {"usuario": "user", "luzi": "assistant"}
    historico = [{"role": papeis[m.papel], "content": m.conteudo} for m in mensagens]
    while historico and historico[0]["role"] != "user":
        historico.pop(0)
    if not historico or historico[-1]["role"] != "user":
        raise LuziErro(400, "A última mensagem precisa ser uma pergunta do usuário.")
    return historico


def _system(ctx: ContextoPerpetuo, inicio: date | None, fim: date | None) -> list[dict[str, Any]]:
    """Bloco fixo (cacheado junto com as ferramentas) + contexto do dia."""
    return [
        {"type": "text", "text": SYSTEM_FIXO, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": _contexto(ctx, inicio, fim)},
    ]


def _contexto(ctx: ContextoPerpetuo, inicio: date | None, fim: date | None) -> str:
    agora = datetime.now(BR_TZ)
    ofertas = "\n".join(
        f"- {o.nome} (categoria: {o.categoria}, código: {codigo})"
        for codigo, o in ctx.ofertas.items()
    ) or "- (nenhuma oferta cadastrada)"
    periodo = (
        f"{_br(inicio or ctx.data_inicio)} a {_br(fim or agora.date())}"
        if inicio or fim
        else f"todo o perpétuo ({_br(ctx.data_inicio)} até hoje)"
    )
    return (
        f"## Contexto\n"
        f"Perpétuo: {ctx.nome} (início em {_br(ctx.data_inicio)})\n"
        f"Ofertas:\n{ofertas}\n"
        f"Hoje: {_br(agora.date())} ({dados.DIAS_SEMANA[agora.weekday()]}), {agora:%H:%M}\n"
        f"Período filtrado no dashboard: {periodo}"
    )


def _br(d: date) -> str:
    return d.strftime("%d/%m/%Y")


# ============================================================
# Execução das ferramentas
# ============================================================
async def _executar_ferramentas(
    db: AsyncSession, ctx: ContextoPerpetuo, conteudo: list[Any]
) -> list[dict[str, Any]]:
    """Executa os tool_use da resposta em sequência (a sessão do banco não
    aceita uso concorrente) e devolve TODOS os resultados numa mensagem."""
    resultados = []
    for bloco in conteudo:
        if bloco.type == "tool_use":
            resultados.append(await _executar_uma(db, ctx, bloco))
    return resultados


async def _executar_uma(db: AsyncSession, ctx: ContextoPerpetuo, bloco: Any) -> dict[str, Any]:
    handler = HANDLERS.get(bloco.name)
    entrada = bloco.input if isinstance(bloco.input, dict) else {}
    try:
        if not handler:
            raise ValueError(f"Ferramenta desconhecida: {bloco.name}")
        resultado = await handler(db, ctx, entrada)
        conteudo, erro = _serializar(resultado), False
    except ValueError as exc:
        conteudo, erro = f"Erro: {exc}", True
    except Exception:  # noqa: BLE001 — erro inesperado vira resultado de erro pro modelo
        logger.exception("Luzi: falha na ferramenta %s", bloco.name)
        await db.rollback()
        conteudo, erro = "Erro interno ao consultar os dados. Tente outra consulta.", True
    return {"type": "tool_result", "tool_use_id": bloco.id, "content": conteudo, "is_error": erro}


def _serializar(resultado: dict[str, Any]) -> str:
    texto = json.dumps(resultado, ensure_ascii=False, default=str, separators=(",", ":"))
    if len(texto) > MAX_CHARS_RESULTADO:
        texto = texto[:MAX_CHARS_RESULTADO] + "…(resultado cortado — refine o filtro ou reduza o limite)"
    return texto


# ============================================================
# Resposta e erros
# ============================================================
def _texto_final(resposta: Any) -> str:
    texto = "\n\n".join(b.text for b in resposta.content if b.type == "text" and b.text.strip())
    if resposta.stop_reason == "max_tokens":
        texto += "\n\n_(resposta cortada por ser muito longa — peça uma parte específica)_"
    return texto.strip() or "Não consegui montar uma resposta. Pode reformular a pergunta?"


def _traduzir_erro(exc: anthropic.APIError) -> LuziErro:
    logger.warning("Luzi: erro da API da Anthropic: %r", exc)
    if isinstance(exc, (anthropic.AuthenticationError, anthropic.PermissionDeniedError)):
        return LuziErro(503, "A chave da API da Anthropic é inválida ou sem permissão. Avise um admin.")
    if isinstance(exc, anthropic.RateLimitError):
        return LuziErro(429, "Muitas perguntas ao mesmo tempo. Espere alguns segundos e tente de novo.")
    if isinstance(exc, anthropic.APITimeoutError):
        return LuziErro(504, "A IA demorou demais pra responder. Tente de novo.")
    if isinstance(exc, anthropic.APIConnectionError):
        return LuziErro(502, "Não consegui falar com a IA agora (falha de conexão). Tente de novo.")
    if isinstance(exc, anthropic.BadRequestError) and "workspace" in str(exc).lower():
        return LuziErro(503, "A chave da API da Anthropic precisa de um workspace (ANTHROPIC_WORKSPACE_ID). Avise um admin.")
    return LuziErro(502, "A IA está instável no momento. Tente de novo em instantes.")
