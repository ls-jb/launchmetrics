"""
Recebe webhook do Hotmart (formato 2.0) e grava/atualiza venda.

Baseado em https://developers.hotmart.com/docs/pt-BR/v1/webhook/about-webhook/
Parser tolerante a variações — campos faltando geram None mas não quebram a
ingestão. O payload_bruto fica gravado pra debug.

Mapping principal:
- event: PURCHASE_APPROVED / COMPLETE → aprovada
         BILLET_PRINTED / DELAYED → pendente
         CANCELED / EXPIRED → cancelada
         REFUNDED / CHARGEBACK → reembolsada
- data.purchase.transaction → external_id (UNIQUE com plataforma)
- data.purchase.recurrence_number → recorrencia_seq (>=1 se assinatura)
- data.subscription.subscriber.code → assinatura_id
"""
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi import BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Venda
from app.services import sheets_export_service

# ============================================================
# Mapeamentos
# ============================================================
STATUS_POR_EVENTO = {
    "PURCHASE_APPROVED": "aprovada",
    "PURCHASE_COMPLETE": "aprovada",
    "PURCHASE_BILLET_PRINTED": "pendente",
    "PURCHASE_DELAYED": "pendente",
    "PURCHASE_CANCELED": "cancelada",
    "PURCHASE_EXPIRED": "cancelada",
    "PURCHASE_REFUNDED": "reembolsada",
    "PURCHASE_CHARGEBACK": "reembolsada",
    "PURCHASE_PROTEST": "reembolsada",
    # NOTAS — eventos que ignoramos de propósito:
    # - PURCHASE_OUT_OF_SHOPPING_CART: abandono de carrinho, não é venda
    # - SUBSCRIPTION_CANCELLATION: cancelamento de assinatura. Não vem com
    #   purchase.transaction; pra refletir no dashboard precisaríamos buscar
    #   vendas anteriores pela assinatura_id e marcar como canceladas. Fica
    #   pra um próximo turno.
}

METODO_POR_PAYMENT_TYPE = {
    "CREDIT_CARD": "cartao",
    "BILLET": "boleto",
    "PIX": "pix",
    "PAYPAL": "outro",
    "GOOGLE_PAY": "cartao",
    "SAMSUNG_PAY": "cartao",
    "TWO_CREDIT_CARDS": "cartao_2x",
    "HYBRID_PAYMENT": "cartao_2x",
    "DIRECT_DEBIT": "transferencia",
    "BANK_TRANSFER": "transferencia",
}


# ============================================================
# Entry point
# ============================================================
async def processar(
    db: AsyncSession,
    payload: dict,
    *,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    """Processa um webhook do Hotmart. UPSERT por (Hotmart, external_id).
    Quando `background_tasks` vem, o export pra planilha é enfileirado e
    não bloqueia o response. Backfill chama sem isso → await direto."""
    evento = (payload.get("event") or "").upper()
    if evento not in STATUS_POR_EVENTO:
        # eventos desconhecidos: só logamos no payload_bruto, não criamos venda
        return

    data = payload.get("data") or {}
    purchase = data.get("purchase") or {}
    external_id = purchase.get("transaction")
    if not external_id:
        # Sem purchase.transaction não é venda real (pode ser evento de
        # carrinho abandonado, cancelamento de assinatura, etc.). NÃO usar
        # payload.id como fallback — isso geraria vendas-fantasma com
        # IDs de evento como external_id.
        return

    venda_existente = await _buscar_existente(db, str(external_id))

    novos_dados = _extrair_campos(data, evento)
    novos_dados["payload_bruto"] = payload

    if venda_existente:
        _atualizar(venda_existente, novos_dados)
        venda_para_sheets = venda_existente
    else:
        venda_para_sheets = _criar(db, str(external_id), novos_dados)

    await db.commit()
    await db.refresh(venda_para_sheets)
    if background_tasks is not None:
        background_tasks.add_task(sheets_export_service.exportar, venda_para_sheets)
    else:
        await sheets_export_service.exportar(venda_para_sheets)


# ============================================================
# Extração de campos do payload
# ============================================================
def _extrair_campos(data: dict, evento: str) -> dict:
    purchase = data.get("purchase") or {}
    product = data.get("product") or {}
    buyer = data.get("buyer") or {}
    subscription = data.get("subscription") or {}

    tipo, recorrencia_seq, assinatura_id = _extrair_recorrencia(purchase, subscription)
    metodo = _extrair_metodo(purchase)
    valor = _extrair_valor(purchase)
    valor_bruto = _extrair_bruto(purchase, data)
    valor_liquido = _extrair_liquido(data)
    data_venda = _extrair_data(purchase)

    offer = purchase.get("offer") or {}
    oferta_codigo = offer.get("code") if isinstance(offer, dict) else None
    oferta_nome = offer.get("name") if isinstance(offer, dict) else None

    return {
        "produto": product.get("name") or "Produto Hotmart",
        "oferta": _extrair_oferta(purchase),
        "oferta_nome": oferta_nome,
        "oferta_codigo": oferta_codigo,
        "tipo": tipo,
        "recorrencia_seq": recorrencia_seq,
        "assinatura_id": assinatura_id,
        "metodo_pagamento": metodo,
        "valor": valor,
        "valor_bruto": valor_bruto,
        "valor_liquido": valor_liquido,
        "status": STATUS_POR_EVENTO.get(evento, "pendente"),
        "comprador_nome": buyer.get("name"),
        "comprador_email": buyer.get("email"),
        "data_venda": data_venda,
    }


def _extrair_recorrencia(
    purchase: dict, subscription: dict
) -> tuple[str, int | None, str | None]:
    """
    Decide entre venda única e recorrência.
    Hotmart manda 'subscription' em TODA venda de produto de assinatura
    (inclusive a primeira). Pra distinguir o que é "venda nova" vs
    "cobrança recorrente", usamos purchase.recurrence_number:
    - ausente ou 1 → primeira cobrança = entra como tipo='recorrencia' seq=1
    - 2+ → cobrança subsequente = entra como tipo='recorrencia' seq=N
    Sem subscription → venda única padrão.
    """
    if not subscription or not isinstance(subscription, dict):
        return "unica", None, None

    subscriber = subscription.get("subscriber") or {}
    assinatura_id = (
        subscription.get("code")
        or subscriber.get("code")
        or (str(subscription.get("id")) if subscription.get("id") is not None else None)
    )

    seq = purchase.get("recurrence_number")
    try:
        seq_int = int(seq) if seq is not None else 1
        if seq_int < 1:
            seq_int = 1
    except (TypeError, ValueError):
        seq_int = 1

    return "recorrencia", seq_int, assinatura_id


def _extrair_metodo(purchase: dict) -> str | None:
    payment = purchase.get("payment") or {}
    tipo_raw = (payment.get("type") or payment.get("method") or "").upper()
    return METODO_POR_PAYMENT_TYPE.get(tipo_raw)


def _extrair_valor(purchase: dict) -> Decimal:
    """Valor da venda em BRL.

    `price` vem na moeda do comprador (EUR, JPY, PYG...). Gravar isso cru
    fazia 351.969 guaranis virarem R$ 351.969. Em compra estrangeira usamos
    `original_offer_price`, que a Hotmart manda em BRL — em compra BRL ele é
    idêntico a `price`."""
    price = purchase.get("price") or {}
    original = purchase.get("original_offer_price") or {}
    moeda = (price.get("currency_value") or "BRL").upper()

    if moeda != "BRL" and (original.get("currency_value") or "").upper() == "BRL":
        valor = original.get("value")
    else:
        valor = price.get("value")
    if valor is None:
        valor = (purchase.get("full_price") or {}).get("value", 0)
    try:
        return Decimal(str(valor))
    except Exception:
        return Decimal("0")


def _eh_brl(moeda: Any) -> bool:
    """Sem moeda informada = BRL (mesma regra de `_extrair_valor`)."""
    return (str(moeda or "BRL")).upper() == "BRL"


def _decimal_ou_none(valor: Any) -> Decimal | None:
    if valor is None:
        return None
    try:
        return Decimal(str(valor))
    except Exception:
        return None


def _comissoes_produtor(data: dict) -> list[dict]:
    comissoes = data.get("commissions")
    if not isinstance(comissoes, list):
        return []
    return [
        c for c in comissoes if isinstance(c, dict) and c.get("source") == "PRODUCER"
    ]


def _conversao_brl(comissao: dict) -> dict:
    """Bloco `currency_conversion` da comissão quando a Hotmart converteu
    pra BRL (venda internacional); {} se não houver."""
    conv = comissao.get("currency_conversion")
    if isinstance(conv, dict) and _eh_brl(conv.get("converted_to_currency") or "X"):
        return conv
    return {}


def _liquido_em_brl(comissao: dict) -> Decimal | None:
    """Comissão em BRL, ou o valor que a própria Hotmart converteu pra BRL
    (venda em dólar/euro). None se não der pra saber em reais."""
    if _eh_brl(comissao.get("currency_value")):
        return _decimal_ou_none(comissao.get("value"))
    return _decimal_ou_none(_conversao_brl(comissao).get("converted_value"))


def _taxa_conversao(data: dict, moeda: Any) -> Decimal | None:
    """Câmbio que a Hotmart usou pra converter a comissão da `moeda` em BRL."""
    for c in _comissoes_produtor(data):
        if str(c.get("currency_value") or "").upper() == str(moeda or "").upper():
            taxa = _decimal_ou_none(_conversao_brl(c).get("conversion_rate"))
            if taxa:
                return taxa
    return None


def _extrair_bruto(purchase: dict, data: dict | None = None) -> Decimal | None:
    """O que o cliente pagou (full_price, com juros do parcelamento), em BRL.
    Compra em outra moeda: converte pelo câmbio que a Hotmart usou na
    comissão. Sem câmbio → None (o dash usa o valor da venda)."""
    full = purchase.get("full_price") or {}
    if not isinstance(full, dict):
        return None
    valor = _decimal_ou_none(full.get("value"))
    if valor is None or _eh_brl(full.get("currency_value")):
        return valor
    taxa = _taxa_conversao(data or {}, full.get("currency_value"))
    return (valor * taxa).quantize(Decimal("0.01")) if taxa else None


def _extrair_liquido(data: dict) -> Decimal | None:
    """O que a Hotmart repassa ao produtor: soma das commissions com
    source=PRODUCER, em BRL. Já vem sem a taxa da Hotmart e sem comissão
    de afiliado — bate com a "Receita Líquida" do relatório da Hotmart.
    Venda internacional: usa o valor que a Hotmart converteu pra BRL.
    None quando o payload não traz (vendas antigas)."""
    valores = [_liquido_em_brl(c) for c in _comissoes_produtor(data)]
    valores = [v for v in valores if v is not None]
    return sum(valores, Decimal("0")) if valores else None


def _extrair_data(purchase: dict) -> datetime:
    """Hotmart manda datas como timestamp em milissegundos."""
    for key in ("approved_date", "order_date", "creation_date"):
        ts = purchase.get(key)
        if ts:
            try:
                return datetime.fromtimestamp(int(ts) / 1000, tz=timezone.utc)
            except (TypeError, ValueError):
                continue
    return datetime.now(tz=timezone.utc)


def _extrair_oferta(purchase: dict) -> str | None:
    """
    Detecta o tipo de oferta. Hotmart indica:
    - purchase.order_bump.is_order_bump = true → Order Bump
    - purchase.is_funnel = true (com offer.code "up"/"down") → Upsell/Downsell
    - Caso contrário, é a oferta principal do produto
    """
    order_bump = purchase.get("order_bump") or {}
    if isinstance(order_bump, dict) and order_bump.get("is_order_bump"):
        return "Order Bump"

    offer = purchase.get("offer") or {}
    code = (offer.get("code") or offer.get("name") or "").lower()

    if "upsell" in code or code.startswith("up"):
        return "Upsell"
    if "downsell" in code or code.startswith("down"):
        return "Downsell"
    if code:
        return "Principal"
    return None


# ============================================================
# Banco
# ============================================================
async def _buscar_existente(db: AsyncSession, external_id: str) -> Venda | None:
    stmt = select(Venda).where(
        Venda.plataforma == "Hotmart",
        Venda.external_id == external_id,
    )
    return (await db.execute(stmt)).scalar_one_or_none()


def _criar(db: AsyncSession, external_id: str, dados: dict[str, Any]) -> Venda:
    venda = Venda(plataforma="Hotmart", external_id=external_id, **dados)
    db.add(venda)
    return venda


def _atualizar(venda: Venda, dados: dict[str, Any]) -> None:
    """Webhook pode chegar várias vezes pra mesma venda (pending → approved → refunded).
    Atualiza só status, payload_bruto e campos que podem variar."""
    venda.status = dados["status"]
    venda.payload_bruto = dados["payload_bruto"]
    # Líquido/bruto acompanham o payload mais recente que trouxer o dado
    for campo in ("valor_bruto", "valor_liquido"):
        if dados.get(campo) is not None:
            setattr(venda, campo, dados[campo])
    # Outros campos só sobrescrevemos se estavam vazios (preserva valor original)
    if not venda.metodo_pagamento and dados.get("metodo_pagamento"):
        venda.metodo_pagamento = dados["metodo_pagamento"]
    if not venda.comprador_email and dados.get("comprador_email"):
        venda.comprador_email = dados["comprador_email"]
    if not venda.comprador_nome and dados.get("comprador_nome"):
        venda.comprador_nome = dados["comprador_nome"]
