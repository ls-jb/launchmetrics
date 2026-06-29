"""
Integração com a Meta Marketing API — puxa gasto por dia × campanha.

Autenticação: System User Access Token (env META_ACCESS_TOKEN). Vale pra
sempre, escopo `ads_read`. Vide guia em docs/sprint2-meta.md.

Endpoint usado:
  GET /v21.0/act_{ad_account_id}/insights
      ?level=campaign
      &fields=spend,campaign_name
      &time_increment=1
      &time_range={"since":"YYYY-MM-DD","until":"YYYY-MM-DD"}
      &limit=500

Retorna 1 entrada por (dia × campanha). Como a Meta não permite filtrar
campanha por substring no nome via API REST direto, pegamos tudo e
filtramos localmente em Python (mesmo padrão do MCP).
"""
from __future__ import annotations

import logging
import os
from collections import defaultdict
from datetime import date
from decimal import Decimal

import httpx

logger = logging.getLogger(__name__)

API_VERSION = "v21.0"
BASE_URL = f"https://graph.facebook.com/{API_VERSION}"
TIMEOUT_S = 30.0


def _token() -> str | None:
    """Lê o token do env. None = não configurado, sync vira no-op."""
    return (os.getenv("META_ACCESS_TOKEN") or "").strip() or None


async def diagnostico(
    ad_account_id: str,
    inicio: date,
    fim: date,
    filtro_nome: str | None = None,
) -> dict:
    """Versão de debug do puxar_gasto_por_dia. Não retorna o token, só
    flag de presença. Retorna o status HTTP da Meta + primeiros 300
    chars da resposta — pra distinguir token ausente x inválido x
    ad account errada x filtro sem match."""
    token = _token()
    if not token:
        return {
            "token_presente": False,
            "ad_account_id": ad_account_id,
            "periodo": [inicio.isoformat(), fim.isoformat()],
            "erro": "META_ACCESS_TOKEN não configurado nas envs do servidor",
        }
    if fim < inicio:
        return {
            "token_presente": True,
            "erro": "data_fim anterior a data_inicio",
        }

    act_id = ad_account_id if ad_account_id.startswith("act_") else f"act_{ad_account_id}"
    url = f"{BASE_URL}/{act_id}/insights"
    params = {
        "level": "campaign",
        "fields": "spend,campaign_name",
        "time_increment": "1",
        "time_range": f'{{"since":"{inicio.isoformat()}","until":"{fim.isoformat()}"}}',
        "limit": "500",
        "access_token": token,
    }
    filtro = (filtro_nome or "").strip().lower()

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as cli:
            resp = await cli.get(url, params=params)
    except Exception as e:
        return {
            "token_presente": True,
            "ad_account_id": act_id,
            "periodo": [inicio.isoformat(), fim.isoformat()],
            "erro": f"Falha de rede: {e!r}",
        }

    base = {
        "token_presente": True,
        "ad_account_id": act_id,
        "periodo": [inicio.isoformat(), fim.isoformat()],
        "filtro": filtro_nome,
        "status_meta": resp.status_code,
        "resposta_parcial": resp.text[:300],
    }
    if resp.status_code >= 400:
        return base

    payload = resp.json()
    linhas = payload.get("data") or []
    campanhas_vistas = sorted({
        (linha.get("campaign_name") or "—") for linha in linhas
    })
    casaram = sorted({
        (linha.get("campaign_name") or "—")
        for linha in linhas
        if not filtro or filtro in (linha.get("campaign_name") or "").lower()
    })
    total = Decimal("0")
    for linha in linhas:
        nome = (linha.get("campaign_name") or "").lower()
        if filtro and filtro not in nome:
            continue
        try:
            total += Decimal(str(linha.get("spend") or "0"))
        except Exception:
            pass

    return {
        **base,
        "total_linhas": len(linhas),
        "campanhas_no_periodo": campanhas_vistas[:20],
        "campanhas_que_casaram_filtro": casaram[:20],
        "total_gasto_apos_filtro": str(total),
    }


async def puxar_gasto_por_dia(
    ad_account_id: str,
    inicio: date,
    fim: date,
    filtro_nome: str | None = None,
) -> dict[date, Decimal]:
    """
    Retorna {dia: gasto_em_reais} agregado das campanhas da ad account.

    Se `filtro_nome` vier, só campanhas cujo nome contenha essa substring
    entram (case insensitive). Se for None, todas as campanhas da conta
    contam.

    Em caso de falha (token ausente, API caiu, etc.), loga e retorna {}.
    Nunca propaga exceção pra não derrubar o sync de outros perpétuos.
    """
    token = _token()
    if not token:
        logger.warning("META_ACCESS_TOKEN não configurado — sync pulado")
        return {}
    if fim < inicio:
        return {}

    # A Meta espera o ad_account_id prefixado com 'act_'
    act_id = ad_account_id if ad_account_id.startswith("act_") else f"act_{ad_account_id}"
    url = f"{BASE_URL}/{act_id}/insights"
    params = {
        "level": "campaign",
        "fields": "spend,campaign_name",
        "time_increment": "1",
        "time_range": f'{{"since":"{inicio.isoformat()}","until":"{fim.isoformat()}"}}',
        "limit": "500",
        "access_token": token,
    }

    filtro = (filtro_nome or "").strip().lower()
    agregado: dict[date, Decimal] = defaultdict(lambda: Decimal("0"))

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as cli:
            # A Meta pagina; segue o cursor até acabar
            while True:
                resp = await cli.get(url, params=params)
                if resp.status_code >= 400:
                    logger.error(
                        "Meta API %s pra %s: %s",
                        resp.status_code, act_id, resp.text[:300],
                    )
                    return {}
                payload = resp.json()
                for linha in payload.get("data") or []:
                    nome = (linha.get("campaign_name") or "").lower()
                    if filtro and filtro not in nome:
                        continue
                    spend = linha.get("spend") or "0"
                    dia_str = linha.get("date_start")
                    if not dia_str:
                        continue
                    try:
                        dia = date.fromisoformat(dia_str)
                        valor = Decimal(str(spend))
                    except (ValueError, TypeError):
                        continue
                    agregado[dia] += valor

                # paginação cursor-based
                proxima = (payload.get("paging") or {}).get("next")
                if not proxima:
                    break
                url = proxima
                params = {}  # query já vem na URL "next"
    except Exception:
        logger.exception("Falha puxando gasto Meta pra %s", act_id)
        return {}

    return dict(agregado)
