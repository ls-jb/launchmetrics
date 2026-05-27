"""
Recebe webhook do Guru (Digital Manager Guru) e grava/atualiza venda.

Parser tolerante a variações — Guru tem múltiplos formatos de webhook
dependendo da versão da conta. Salvamos sempre o payload_bruto e tentamos
extrair os campos por vários caminhos possíveis.

Mapping principal:
- status: approved → aprovada
          billet_printed / waiting_payment → pendente
          canceled → cancelada
          refunded / chargedback → reembolsada
- data.id ou transaction.id → external_id
- subscription.current_invoice → recorrencia_seq
- subscription.id → assinatura_id
"""
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Venda

# ============================================================
# Mapeamentos
# ============================================================
STATUS_GURU = {
    "approved": "aprovada",
    "complete": "aprovada",
    "completed": "aprovada",
    "paid": "aprovada",
    "billet_printed": "pendente",
    "billet_issued": "pendente",
    "waiting_payment": "pendente",
    "pending": "pendente",
    "canceled": "cancelada",
    "cancelled": "cancelada",
    "expired": "cancelada",
    "refunded": "reembolsada",
    "refund": "reembolsada",
    "chargedback": "reembolsada",
    "chargeback": "reembolsada",
}

METODO_GURU = {
    "credit_card": "cartao",
    "creditcard": "cartao",
    "cartao_credito": "cartao",
    "billet": "boleto",
    "boleto": "boleto",
    "pix": "pix",
    "two_credit_cards": "cartao_2x",
    "two_creditcards": "cartao_2x",
    "bank_transfer": "transferencia",
    "transferencia": "transferencia",
}


# ============================================================
# Entry point
# ============================================================
async def processar(db: AsyncSession, payload: dict) -> None:
    """UPSERT por (Guru, external_id)."""
    data = _localizar_data(payload)
    external_id = _extrair_external_id(payload, data)
    if not external_id:
        return

    status_raw = (data.get("status") or payload.get("status") or "").lower()
    status = STATUS_GURU.get(status_raw)
    if not status:
        # status desconhecido → não cria venda
        return

    venda_existente = await _buscar_existente(db, external_id)
    novos_dados = _extrair_campos(payload, data, status)
    novos_dados["payload_bruto"] = payload

    if venda_existente:
        _atualizar(venda_existente, novos_dados)
    else:
        _criar(db, external_id, novos_dados)

    await db.commit()


# ============================================================
# Helpers de extração
# ============================================================
def _localizar_data(payload: dict) -> dict:
    """O Guru às vezes coloca o objeto principal em 'data', às vezes na raiz."""
    if isinstance(payload.get("data"), dict):
        return payload["data"]
    if isinstance(payload.get("transaction"), dict):
        return payload["transaction"]
    return payload


def _extrair_external_id(payload: dict, data: dict) -> str | None:
    raw = (
        data.get("id")
        or data.get("transaction_id")
        or payload.get("id")
        or payload.get("transaction_id")
    )
    return str(raw) if raw else None


def _extrair_campos(payload: dict, data: dict, status: str) -> dict:
    produto, oferta = _extrair_produto_e_oferta(data)
    comprador_nome, comprador_email = _extrair_comprador(data)
    tipo, seq, assinatura_id = _extrair_recorrencia(data)

    return {
        "produto": produto,
        "oferta": oferta,
        "tipo": tipo,
        "recorrencia_seq": seq,
        "assinatura_id": assinatura_id,
        "metodo_pagamento": _extrair_metodo(data),
        "valor": _extrair_valor(data),
        "status": status,
        "comprador_nome": comprador_nome,
        "comprador_email": comprador_email,
        "data_venda": _extrair_data(data, payload),
    }


def _extrair_produto_e_oferta(data: dict) -> tuple[str, str | None]:
    product = data.get("product") or data.get("offer") or {}
    if isinstance(product, dict):
        nome = product.get("name") or product.get("title") or "Produto Guru"
    else:
        nome = "Produto Guru"

    offer = data.get("offer") or {}
    offer_name = (offer.get("name") or "").lower() if isinstance(offer, dict) else ""
    if "order" in offer_name and "bump" in offer_name:
        return nome, "Order Bump"
    if "upsell" in offer_name:
        return nome, "Upsell"
    if "downsell" in offer_name:
        return nome, "Downsell"
    if offer_name:
        return nome, "Principal"
    return nome, None


def _extrair_comprador(data: dict) -> tuple[str | None, str | None]:
    for chave in ("customer", "buyer", "contact"):
        obj = data.get(chave)
        if isinstance(obj, dict):
            return obj.get("name"), obj.get("email")
    return None, None


def _extrair_recorrencia(data: dict) -> tuple[str, int | None, str | None]:
    subscription = data.get("subscription") or {}
    if not subscription:
        return "unica", None, None
    if not isinstance(subscription, dict):
        return "unica", None, None

    assinatura_id = (
        subscription.get("id")
        or subscription.get("code")
        or subscription.get("subscription_id")
    )
    seq = (
        subscription.get("current_invoice")
        or subscription.get("invoice_number")
        or subscription.get("billing_cycle")
        or 1
    )
    try:
        seq_int = max(int(seq), 1)
    except (TypeError, ValueError):
        seq_int = 1

    return "recorrencia", seq_int, str(assinatura_id) if assinatura_id else None


def _extrair_metodo(data: dict) -> str | None:
    payment = data.get("payment") or {}
    raw = (
        (payment.get("method") if isinstance(payment, dict) else None)
        or data.get("payment_method")
        or ""
    )
    return METODO_GURU.get(str(raw).lower())


def _extrair_valor(data: dict) -> Decimal:
    """
    Guru às vezes manda valor em reais (1997.00) e às vezes em centavos (199700).
    Heurística: se > 1_000_000 e inteiro, provavelmente é centavos.
    """
    valor = data.get("amount") or data.get("value") or data.get("total")
    if valor is None:
        payment = data.get("payment") or {}
        if isinstance(payment, dict):
            valor = payment.get("amount") or payment.get("value")
    if valor is None:
        return Decimal("0")
    try:
        d = Decimal(str(valor))
        if d > 1_000_000 and d == d.to_integral_value():
            d = d / 100
        return d
    except Exception:
        return Decimal("0")


def _extrair_data(data: dict, payload: dict) -> datetime:
    """Guru manda ISO 8601 normalmente."""
    for key in ("confirmed_at", "approved_at", "paid_at", "created_at", "date"):
        v = data.get(key) or payload.get(key)
        if v:
            try:
                # remove 'Z' e usa fromisoformat
                if isinstance(v, str):
                    v_clean = v.replace("Z", "+00:00")
                    return datetime.fromisoformat(v_clean)
                if isinstance(v, (int, float)):
                    # alguns webhooks mandam timestamp Unix
                    return datetime.fromtimestamp(int(v), tz=timezone.utc)
            except (TypeError, ValueError):
                continue
    return datetime.now(tz=timezone.utc)


# ============================================================
# Banco
# ============================================================
async def _buscar_existente(db: AsyncSession, external_id: str) -> Venda | None:
    stmt = select(Venda).where(
        Venda.plataforma == "Guru",
        Venda.external_id == external_id,
    )
    return (await db.execute(stmt)).scalar_one_or_none()


def _criar(db: AsyncSession, external_id: str, dados: dict[str, Any]) -> None:
    venda = Venda(plataforma="Guru", external_id=external_id, **dados)
    db.add(venda)


def _atualizar(venda: Venda, dados: dict[str, Any]) -> None:
    venda.status = dados["status"]
    venda.payload_bruto = dados["payload_bruto"]
    if not venda.metodo_pagamento and dados.get("metodo_pagamento"):
        venda.metodo_pagamento = dados["metodo_pagamento"]
    if not venda.comprador_email and dados.get("comprador_email"):
        venda.comprador_email = dados["comprador_email"]
    if not venda.comprador_nome and dados.get("comprador_nome"):
        venda.comprador_nome = dados["comprador_nome"]
