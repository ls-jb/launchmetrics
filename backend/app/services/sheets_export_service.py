"""
Exporta cada venda para a planilha Google Sheets via Apps Script.

Por que assim:
- A planilha é "segundo plano" (definido com o usuário) — não pode bloquear
  nem derrubar o fluxo do webhook. Toda chamada está dentro de try/except
  amplo e qualquer erro só vai pro log.
- Apps Script publicado como Web App: aceita POST de qualquer um, faz
  upsert na linha (procura pelo external_id + plataforma).
- Configuração: SHEETS_WEBHOOK_URL no .env. Vazio = export desligado
  (útil em local sem precisar mockar Google).

Fluxo:
1. Cada handler de venda (guru, hotmart, manual) chama `exportar(venda)`
   depois do commit no banco.
2. `_montar_linha` lê venda + payload_bruto e gera o dict com as 18
   colunas que a planilha espera.
3. POST com timeout curto. Erro → log → ignora.
"""
import json
import logging
import os
from typing import Any

import httpx

from app.models import Venda

logger = logging.getLogger(__name__)

URL = os.getenv("SHEETS_WEBHOOK_URL", "").strip()
TIMEOUT_S = 5.0


# ============================================================
# Entry point
# ============================================================
async def exportar(venda: Venda) -> None:
    """Envia a venda para a planilha. Nunca propaga erro."""
    if not URL:
        return
    try:
        linha = _montar_linha(venda)
        async with httpx.AsyncClient(timeout=TIMEOUT_S) as cli:
            resp = await cli.post(URL, json=linha, follow_redirects=True)
            if resp.status_code >= 400:
                logger.warning(
                    "Sheets respondeu %s para venda %s", resp.status_code, venda.id
                )
    except Exception:
        # Tudo que não for sucesso vira log e segue — planilha é secundária
        logger.exception("Falha enviando venda %s para Sheets (ignorado)", venda.id)


# ============================================================
# Montagem da linha (mapeamento payload → colunas)
# ============================================================
def _montar_linha(venda: Venda) -> dict[str, Any]:
    payload = venda.payload_bruto or {}
    # Guru e Hotmart aninham os dados em "data"; cadastro manual tem
    # payload_bruto=None e cai direto no "raiz vazio".
    data = payload.get("data") if isinstance(payload.get("data"), dict) else payload

    utm_content = _get(data, "tracking.content", "utm_content", "utm.content")
    # O UTM Content da Guru às vezes vem como JSON {"vsrc":"whatsapp",...}.
    # Se for, o vk_source real está lá dentro.
    vk_source = _extrair_vsrc(utm_content) or _get(
        data, "vk_source", "tracking.vk_source", "tracking.vsrc"
    )

    return {
        # plataforma + external_id formam a chave de upsert no Apps Script.
        # Vendas manuais não têm external_id da plataforma — sintetizamos
        # com o uuid interno pra ter chave estável.
        "external_id": str(venda.external_id or f"manual_{venda.id}"),
        "plataforma": venda.plataforma,
        "status": venda.status,
        "data_venda": venda.data_venda.isoformat() if venda.data_venda else "",
        "comprador_nome": venda.comprador_nome or "",
        "email": venda.comprador_email or "",
        "telefone": _extrair_telefone(data),
        "produto": venda.produto,
        "oferta": venda.oferta_nome or venda.oferta or "",
        "valor": float(venda.valor) if venda.valor is not None else 0,
        "utm_source": _txt(_get(data, "tracking.source", "utm_source", "utm.source")),
        "utm_medium": _txt(_get(data, "tracking.medium", "utm_medium", "utm.medium")),
        "utm_content": _txt(utm_content),
        "utm_campaign": _txt(_get(data, "tracking.campaign", "utm_campaign", "utm.campaign")),
        "utm_segmentation": _txt(
            _get(data, "tracking.term", "utm_term", "utm_segmentation", "utm.term")
        ),
        "conversion": _txt(_get(data, "conversion", "tracking.conversion")),
        "vk_source": _txt(vk_source),
        "vk_ad_id": _txt(_get(data, "vk_ad_id", "tracking.vk_ad_id")),
    }


# ============================================================
# Helpers
# ============================================================
def _get(payload: Any, *paths: str) -> Any:
    """Retorna o primeiro valor não-vazio dentre os paths (dot-notation).
    Ex: _get(d, "tracking.source", "utm_source") tenta d['tracking']['source']
    e depois d['utm_source']."""
    if not isinstance(payload, dict):
        return None
    for path in paths:
        cur: Any = payload
        for k in path.split("."):
            if isinstance(cur, dict):
                cur = cur.get(k)
            else:
                cur = None
                break
        if cur:
            return cur
    return None


def _txt(v: Any) -> str:
    if v is None:
        return ""
    return str(v)


def _extrair_telefone(data: dict) -> str:
    """Procura telefone do comprador. Guru/Hotmart guardam em
    customer/buyer/contact com nomes variados — tenta todos."""
    for chave in ("customer", "buyer", "contact"):
        obj = data.get(chave) if isinstance(data, dict) else None
        if not isinstance(obj, dict):
            continue
        for p in ("phone", "phone_number", "phoneNumber", "mobile"):
            v = obj.get(p)
            if not v:
                continue
            ddd = obj.get("phone_local_code") or obj.get("ddd")
            if ddd and not str(v).startswith(str(ddd)):
                return f"({ddd}) {v}"
            return str(v)
    return ""


def _extrair_vsrc(utm_content: Any) -> str | None:
    """UTM Content da Guru às vezes é um JSON {"co": "...", "vsrc": "...",
    "url": "...", "v": 1}. Extrai o vsrc se for esse formato; senão None."""
    if not isinstance(utm_content, str):
        return None
    s = utm_content.strip()
    if not (s.startswith("{") and s.endswith("}")):
        return None
    try:
        d = json.loads(s)
    except (ValueError, TypeError):
        return None
    if not isinstance(d, dict):
        return None
    v = d.get("vsrc") or d.get("vk_source")
    return str(v) if v else None
