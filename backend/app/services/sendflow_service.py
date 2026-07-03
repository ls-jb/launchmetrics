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

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://sendflow.pro/sendapi"
TIMEOUT_S = 15.0


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


async def leads_no_grupo(release_id: str) -> dict:
    """Retorna {total, grupos_count, release_id} da campanha SendFlow.
    On-demand. Em caso de falha (token ausente, API caiu, etc.), loga e
    retorna zerado — nunca propaga exceção pra não derrubar o carregar
    do LancamentoDetalhe."""
    token = _token()
    base = {"total": 0, "grupos_count": 0, "release_id": release_id}
    if not token:
        logger.warning("SENDFLOW_API_TOKEN não configurado — leads_no_grupo pulado")
        return base
    if not release_id:
        return base

    url = f"{BASE_URL}/releases/{release_id}/groups"
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as cli:
            resp = await cli.get(
                url, headers={"Authorization": f"Bearer {token}"}
            )
    except Exception:
        logger.exception("Falha chamando SendFlow em %s", url)
        return base

    if resp.status_code >= 400:
        logger.error(
            "SendFlow %s pra release %s: %s",
            resp.status_code, release_id, resp.text[:300],
        )
        return base

    try:
        grupos = resp.json()
    except Exception:
        logger.exception("SendFlow resposta não é JSON válido")
        return base

    if not isinstance(grupos, list):
        return base

    total = sum(int(g.get("participantsAmount") or 0) for g in grupos)
    return {
        "total": total,
        "grupos_count": len(grupos),
        "release_id": release_id,
    }
