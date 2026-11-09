"""
Cliente da API de Analytics da VTurb (https://analytics.vturb.com).

Autenticação: chave gerada em app.vturb.com/settings/analytics-api (env
VTURB_API_TOKEN), enviada no header X-Api-Token junto com X-Api-Version
e User-Agent (sem User-Agent a VTurb responde 403).

Cada chamada vira uma `Consulta` (caminho + corpo). `resolver()` lê do
cache (launchmetrics.vturb_cache) o que ainda vale, busca o resto em
paralelo (no máximo MAX_PARALELO por vez — o plano permite ~80 consultas
por minuto) e grava as respostas novas no cache.

Formatos conferidos contra a API real (nov/2026):
- datas precisam de hora: "AAAA-MM-DD HH:MM:SS" (só a data → 400);
- dinheiro vem em centavos (total_amount_brl);
- algumas taxas vêm como texto ("38.25");
- /times/user_engagement → grouped_timed[].total_users é quantos SAÍRAM
  naquele trecho de 5 s (a retenção é o acumulado);
- /sessions/stats_by_day devolve um dia a mais em cada ponta (fuso).
"""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from typing import Any
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import VturbCache

logger = logging.getLogger(__name__)

BASE_URL = "https://analytics.vturb.com"
TIMEOUT_S = 30.0
FUSO = "America/Sao_Paulo"
BR_TZ = ZoneInfo(FUSO)
USER_AGENT = "launchmetrics/1.0"
MAX_PARALELO = 4
TTL_COM_HOJE = timedelta(minutes=10)
TTL_PASSADO = timedelta(hours=12)
TTL_CATALOGO = timedelta(minutes=30)

_transport: httpx.AsyncBaseTransport | None = None
"""Só pra testes (httpx.MockTransport). Em produção fica None."""


class VturbErro(Exception):
    """Falha ao consultar a VTurb — a mensagem já vai pronta pra tela."""


class VturbNaoConfigurada(VturbErro):
    """Falta a VTURB_API_TOKEN no backend."""


def configurada() -> bool:
    return bool(settings.VTURB_API_TOKEN.strip())


# ============================================================
# Consultas
# ============================================================
@dataclass
class Consulta:
    caminho: str
    corpo: dict[str, Any] | None = None
    """Corpo JSON (POST). None = GET."""
    ttl: timedelta = TTL_COM_HOJE

    @property
    def chave(self) -> str:
        return f"{self.caminho}?{json.dumps(self.corpo or {}, sort_keys=True)}"


def hoje_br() -> date:
    return datetime.now(BR_TZ).date()


def ttl_janela(fim: date) -> timedelta:
    """Janela que inclui hoje muda o tempo todo; passado é estável."""
    return TTL_COM_HOJE if fim >= hoje_br() else TTL_PASSADO


def _periodo(inicio: date, fim: date) -> dict[str, str]:
    """Janela fechada em BRT: do começo do 1º dia ao fim do último."""
    return {
        "start_date": f"{inicio.isoformat()} 00:00:00",
        "end_date": f"{fim.isoformat()} 23:59:59",
        "timezone": FUSO,
    }


def consulta_players() -> Consulta:
    return Consulta("/players/list", None, TTL_CATALOGO)


def consulta_plays_por_player(inicio: date, fim: date) -> Consulta:
    periodo = _periodo(inicio, fim)
    corpo = {"events": ["started"], "start_date": periodo["start_date"], "end_date": periodo["end_date"]}
    return Consulta("/events/total_by_company_players", corpo, TTL_CATALOGO)


def consulta_stats(player_id: str, inicio: date, fim: date, por_dia: bool = False) -> Consulta:
    caminho = "/sessions/stats_by_day" if por_dia else "/sessions/stats"
    return Consulta(caminho, {"player_id": player_id, **_periodo(inicio, fim)}, ttl_janela(fim))


def consulta_engajamento(player_id: str, duracao_seg: int, inicio: date, fim: date) -> Consulta:
    corpo = {"player_id": player_id, "video_duration": duracao_seg, **_periodo(inicio, fim)}
    return Consulta("/times/user_engagement", corpo, ttl_janela(fim))


def consulta_cliques_por_tempo(player_id: str, inicio: date, fim: date) -> Consulta:
    corpo = {"player_id": player_id, **_periodo(inicio, fim)}
    return Consulta("/clicks/total_by_company_timed", corpo, ttl_janela(fim))


def consulta_conversoes_por_tempo(player_id: str, inicio: date, fim: date) -> Consulta:
    corpo = {"player_id": player_id, **_periodo(inicio, fim)}
    return Consulta("/conversions/video_timed", corpo, ttl_janela(fim))


# ============================================================
# HTTP + cache
# ============================================================
def _headers() -> dict[str, str]:
    token = settings.VTURB_API_TOKEN.strip()
    if not token:
        raise VturbNaoConfigurada("VTurb não configurada: falta a VTURB_API_TOKEN no backend.")
    return {"X-Api-Token": token, "X-Api-Version": "v1", "User-Agent": USER_AGENT}


def _erro_da_resposta(resp: httpx.Response) -> VturbErro:
    if resp.status_code == 401:
        return VturbErro("A VTurb recusou a chave. Gere uma nova em Configurações > Analytics API.")
    if resp.status_code == 429:
        return VturbErro("Limite de consultas da VTurb atingido. Tente de novo em 1 minuto.")
    logger.error("VTurb %s em %s: %s", resp.status_code, resp.request.url.path, resp.text[:300])
    return VturbErro(f"A VTurb respondeu com erro {resp.status_code}.")


async def _requisitar(cli: httpx.AsyncClient, consulta: Consulta) -> Any:
    try:
        if consulta.corpo is None:
            resp = await cli.get(consulta.caminho)
        else:
            resp = await cli.post(consulta.caminho, json=consulta.corpo)
    except httpx.HTTPError as e:
        logger.warning("VTurb sem resposta em %s: %s", consulta.caminho, e)
        raise VturbErro("A VTurb não respondeu. Tente de novo em instantes.") from e
    if resp.status_code >= 400:
        raise _erro_da_resposta(resp)
    return resp.json()


async def _buscar_em_paralelo(consultas: list[Consulta]) -> list[Any]:
    """Uma resposta (ou exceção) por consulta, na mesma ordem."""
    sem = asyncio.Semaphore(MAX_PARALELO)
    async with httpx.AsyncClient(
        base_url=BASE_URL, headers=_headers(), timeout=TIMEOUT_S, transport=_transport
    ) as cli:

        async def _uma(c: Consulta) -> Any:
            async with sem:
                return await _requisitar(cli, c)

        return await asyncio.gather(*(_uma(c) for c in consultas), return_exceptions=True)


async def _ler_cache(db: AsyncSession, chaves: list[str]) -> dict[str, Any]:
    if not chaves:
        return {}
    agora = datetime.now(timezone.utc)
    rows = await db.execute(
        select(VturbCache.chave, VturbCache.payload).where(
            VturbCache.chave.in_(chaves), VturbCache.expira_em > agora
        )
    )
    return {r.chave: r.payload for r in rows}


async def _gravar_cache(db: AsyncSession, itens: list[tuple[Consulta, Any]]) -> None:
    if not itens:
        return
    agora = datetime.now(timezone.utc)
    valores = [{"chave": c.chave, "payload": p, "expira_em": agora + c.ttl} for c, p in itens]
    stmt = pg_insert(VturbCache).values(valores)
    stmt = stmt.on_conflict_do_update(
        index_elements=[VturbCache.chave],
        set_={"payload": stmt.excluded.payload, "expira_em": stmt.excluded.expira_em},
    )
    await db.execute(stmt)
    await db.commit()


async def resolver(db: AsyncSession, consultas: list[Consulta]) -> dict[str, Any]:
    """{consulta.chave: resposta}. Usa o cache quando ainda vale; o resto
    busca na VTurb e grava no cache. Se alguma consulta falhar, as que
    deram certo ficam salvas antes do erro subir (a próxima tentativa
    só refaz o que faltou)."""
    unicas = {c.chave: c for c in consultas}
    resultado = await _ler_cache(db, list(unicas))
    faltando = [c for k, c in unicas.items() if k not in resultado]
    if not faltando:
        return resultado
    respostas = await _buscar_em_paralelo(faltando)
    ok = [(c, r) for c, r in zip(faltando, respostas) if not isinstance(r, BaseException)]
    await _gravar_cache(db, ok)
    resultado.update({c.chave: r for c, r in ok})
    erro = next((r for r in respostas if isinstance(r, BaseException)), None)
    if erro is not None:
        raise erro if isinstance(erro, VturbErro) else VturbErro(str(erro))
    return resultado


async def limpar_cache_expirado(db: AsyncSession) -> int:
    res = await db.execute(
        delete(VturbCache).where(VturbCache.expira_em < datetime.now(timezone.utc))
    )
    await db.commit()
    return int(res.rowcount or 0)


# ============================================================
# Normalização das respostas
# ============================================================
def _int(d: dict[str, Any], chave: str) -> int:
    try:
        return int(float(d.get(chave) or 0))
    except (TypeError, ValueError):
        return 0


def _num(d: dict[str, Any], chave: str) -> float | None:
    """Número que pode vir como texto ("38.25"). None se ausente/inválido."""
    valor = d.get(chave)
    try:
        return None if valor is None else float(valor)
    except (TypeError, ValueError):
        return None


def _lista(payload: Any, chave: str = "grouped_timed") -> list[dict[str, Any]]:
    """Aceita a lista direto ou embrulhada em {chave: [...]}."""
    itens = payload.get(chave) if isinstance(payload, dict) else payload
    return [i for i in (itens or []) if isinstance(i, dict)]


@dataclass(frozen=True)
class PlayerVturb:
    id: str
    nome: str
    duracao_seg: int | None = None
    pitch_seg: int | None = None
    criado_em: str | None = None


def normalizar_players(payload: Any) -> dict[str, PlayerVturb]:
    players: dict[str, PlayerVturb] = {}
    for p in _lista(payload, "players"):
        if not p.get("id"):
            continue
        players[str(p["id"])] = PlayerVturb(
            id=str(p["id"]),
            nome=str(p.get("name") or p["id"]),
            duracao_seg=_int(p, "duration") or None,
            pitch_seg=_int(p, "pitch_time") or None,
            criado_em=p.get("created_at"),
        )
    return players


def normalizar_plays_por_player(payload: Any) -> dict[str, int]:
    return {
        str(i["player_id"]): _int(i, "total_uniq_sessions")
        for i in _lista(payload)
        if i.get("player_id")
    }


CAMPOS_CONTAGEM = (
    "views", "views_unicas", "plays", "plays_unicos", "finalizacoes",
    "finalizacoes_unicas", "cliques", "cliques_unicos", "conversoes",
    "receita_centavos",
)


@dataclass
class StatsVsl:
    """Contagens de uma VSL numa janela (ou num dia). Únicos = por sessão."""

    views: int = 0
    views_unicas: int = 0
    plays: int = 0
    plays_unicos: int = 0
    finalizacoes: int = 0
    finalizacoes_unicas: int = 0
    cliques: int = 0
    cliques_unicos: int = 0
    conversoes: int = 0
    receita_centavos: int = 0
    engajamento: float | None = None


def normalizar_stats(d: dict[str, Any]) -> StatsVsl:
    return StatsVsl(
        views=_int(d, "total_viewed"),
        views_unicas=_int(d, "total_viewed_session_uniq"),
        plays=_int(d, "total_started"),
        plays_unicos=_int(d, "total_started_session_uniq"),
        finalizacoes=_int(d, "total_finished"),
        finalizacoes_unicas=_int(d, "total_finished_session_uniq"),
        cliques=_int(d, "total_clicked"),
        cliques_unicos=_int(d, "total_clicked_session_uniq"),
        conversoes=_int(d, "total_conversions"),
        receita_centavos=_int(d, "total_amount_brl"),
        engajamento=_num(d, "engagement_rate"),
    )


def normalizar_stats_por_dia(payload: Any, inicio: date, fim: date) -> dict[date, StatsVsl]:
    """Só os dias dentro de [inicio, fim] — a API manda 1 dia a mais em cada ponta."""
    dias: dict[date, StatsVsl] = {}
    for item in _lista(payload):
        try:
            dia = date.fromisoformat(str(item.get("date_key"))[:10])
        except ValueError:
            continue
        if inicio <= dia <= fim:
            dias[dia] = normalizar_stats(item)
    return dias


@dataclass
class EngajamentoVsl:
    tempo_medio_seg: float | None = None
    engajamento: float | None = None
    saidas_por_segundo: dict[int, int] = field(default_factory=dict)
    """Quantas pessoas saíram em cada trecho (segundo inicial → pessoas)."""

    @property
    def total_usuarios(self) -> int:
        return sum(self.saidas_por_segundo.values())

    def assistindo_em(self, segundo: int) -> int:
        """Pessoas que ainda assistiam no segundo dado."""
        sairam_antes = sum(v for s, v in self.saidas_por_segundo.items() if s < segundo)
        return self.total_usuarios - sairam_antes


def normalizar_engajamento(payload: Any) -> EngajamentoVsl:
    d = payload if isinstance(payload, dict) else {}
    return EngajamentoVsl(
        tempo_medio_seg=_num(d, "average_watched_time"),
        engajamento=_num(d, "engagement_rate"),
        saidas_por_segundo=normalizar_por_tempo(payload, "total_users"),
    )


def normalizar_por_tempo(payload: Any, campo: str) -> dict[int, int]:
    """[{timed, <campo>}] (ou {grouped_timed: [...]}) → {segundo: valor}."""
    por_segundo: dict[int, int] = {}
    for item in _lista(payload):
        if item.get("timed") is None:
            continue
        segundo = _int(item, "timed")
        por_segundo[segundo] = por_segundo.get(segundo, 0) + _int(item, campo)
    return por_segundo
