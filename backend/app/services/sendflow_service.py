"""
Integração com a API HTTP do SendFlow.

Base: https://sendflow.pro/sendapi
Auth: Authorization: Bearer <token> (env SENDFLOW_API_TOKEN)

Uso: puxar o total de participantes dos grupos WhatsApp de uma
campanha (release). Chamado on-demand pelo LancamentoDetalhe —
o valor não é persistido em tabela.
"""
from __future__ import annotations

import logging
import os
import time

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://sendflow.pro/sendapi"
TIMEOUT_S = 15.0
CACHE_TTL_S = 120.0
"""Cache de 2min do total/grupos por release_id. Independente de quem
clique em F5, Atualizar ou qualquer outra ação — só 1 chamada real ao
SendFlow por release a cada 2min. Evita queimar rate limit (que já
bloqueou a key quando batemos muito). O uso do card é observacional,
2min de defasagem é aceitável."""

_cache: dict[str, tuple[float, dict]] = {}
"""release_id → (expira_em, resultado). Simples, em memória, por
processo. Se um resultado com erro estourar, não cacheia."""


def _token() -> str | None:
    return (os.getenv("SENDFLOW_API_TOKEN") or "").strip() or None


async def diagnostico(release_id: str | None) -> dict:
    """Não retorna o token. Só flag de presença + status HTTP da chamada
    ao SendFlow + primeiros 300 chars da resposta. Não persiste."""
    token = _token()
    if not token:
        return {
            "token_presente": False,
            "release_id": release_id,
            "erro": "SENDFLOW_API_TOKEN não configurado nas envs do servidor",
        }
    if not release_id:
        return {
            "token_presente": True,
            "release_id": None,
            "erro": "Lançamento sem sendflow_release_id vinculado",
        }
    url = f"{BASE_URL}/releases/{release_id}/groups"
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as cli:
            resp = await cli.get(
                url, headers={"Authorization": f"Bearer {token}"}
            )
    except Exception as e:
        return {
            "token_presente": True,
            "release_id": release_id,
            "url": url,
            "erro": f"Falha de rede: {e!r}",
        }
    body_preview = resp.text[:300]
    base = {
        "token_presente": True,
        "release_id": release_id,
        "url": url,
        "status": resp.status_code,
        "resposta_parcial": body_preview,
    }
    if resp.status_code >= 400:
        return base
    try:
        grupos = resp.json()
    except Exception:
        return {**base, "erro": "resposta não é JSON válido"}
    if not isinstance(grupos, list):
        return {**base, "erro": "resposta não é array"}
    total = sum(int(g.get("participantsAmount") or 0) for g in grupos)
    return {
        **base,
        "grupos_count": len(grupos),
        "total": total,
    }


class SendflowError(Exception):
    """Erro semântico do SendFlow (token, rede, API). Propaga pro caller
    decidir — em vez de mascarar como 0, o que gera dado errado no
    card."""


async def leads_no_grupo(release_id: str) -> dict:
    """Retorna {total, grupos_count, release_id} da campanha SendFlow.
    Propaga SendflowError quando algo falha — pra não confundir 'API
    caiu' com 'campanha existe mas tem 0 leads'.

    Cache in-memory de CACHE_TTL_S (60s) por release_id — respostas com
    erro NÃO são cacheadas, pra permitir recovery imediato assim que a
    API voltar."""
    token = _token()
    if not token:
        raise SendflowError("SENDFLOW_API_TOKEN não configurado")
    if not release_id:
        return {"total": 0, "grupos_count": 0, "release_id": ""}

    agora = time.monotonic()
    cache_hit = _cache.get(release_id)
    if cache_hit and cache_hit[0] > agora:
        return cache_hit[1]

    url = f"{BASE_URL}/releases/{release_id}/groups"
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as cli:
            resp = await cli.get(
                url, headers={"Authorization": f"Bearer {token}"}
            )
    except Exception as e:
        logger.exception("Falha de rede chamando SendFlow em %s", url)
        raise SendflowError(f"rede: {e!r}") from e

    if resp.status_code >= 400:
        logger.error(
            "SendFlow %s pra release %s: %s",
            resp.status_code, release_id, resp.text[:300],
        )
        raise SendflowError(f"SendFlow HTTP {resp.status_code}")

    try:
        grupos = resp.json()
    except Exception as e:
        logger.exception("SendFlow resposta não é JSON válido")
        raise SendflowError("resposta não é JSON") from e

    if not isinstance(grupos, list):
        raise SendflowError("resposta não é array")

    total = sum(int(g.get("participantsAmount") or 0) for g in grupos)
    resultado = {
        "total": total,
        "grupos_count": len(grupos),
        "release_id": release_id,
    }
    _cache[release_id] = (agora + CACHE_TTL_S, resultado)
    return resultado
