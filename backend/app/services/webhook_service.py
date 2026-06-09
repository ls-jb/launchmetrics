"""
Processa o payload recebido do Go High Level e grava um lead no banco.
Deve ser tolerante a falhas — qualquer erro é logado mas o endpoint do webhook
SEMPRE responde 200 (o GHL não faz retry bem).
"""
from datetime import datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Canal, Lancamento, Lead

BR_TZ = ZoneInfo("America/Sao_Paulo")

# Mapeamento de valores que chegam do GHL → nome canônico do canal.
# Variações de capitalização/espaçamento caem todas no mesmo bucket.
NORMALIZACAO_CANAL = {
    "facebook": "Meta Ads",
    "meta": "Meta Ads",
    "meta ads": "Meta Ads",
    "meta-ads": "Meta Ads",
    "metaads": "Meta Ads",
    "instagram": "Meta Ads",
    "ig": "Meta Ads",
    "google": "Google Ads",
    "google-ads": "Google Ads",
    "googleads": "Google Ads",
    "google ads": "Google Ads",
    "whatsapp": "WhatsApp",
    "wpp": "WhatsApp",
    "email": "Email",
    "newsletter": "Email",
    "organic": "Orgânico",
    "organico": "Orgânico",
    "seo": "Orgânico",
}


async def processar_lead_ghl(db: AsyncSession, token: str, payload: dict) -> None:
    """
    Recebe o payload do GHL e grava um lead. Levanta ValueError se o token
    for inválido — o caller (router) decide o que fazer com o erro.

    Dedup por email (case-insensitive): se já existe lead com o mesmo email
    no mesmo lançamento, ignora silenciosamente. Lead sem email passa direto
    (não tem como dedup).
    """
    lancamento = await _buscar_por_token(db, token)
    if not lancamento:
        raise ValueError(f"Lançamento não encontrado para token: {token}")

    email = (_primeiro(payload, "email", "Email") or "").strip()
    if email:
        ja = (
            await db.execute(
                select(Lead.id)
                .where(
                    Lead.lancamento_id == lancamento.id,
                    func.lower(Lead.email) == email.lower(),
                )
                .limit(1)
            )
        ).scalar_one_or_none()
        if ja is not None:
            return  # duplicado — silencia

    canal_nome = _normalizar(_extrair_canal_bruto(payload))
    canal_id = await _obter_ou_criar_canal(db, lancamento.id, canal_nome)

    lead = Lead(
        lancamento_id=lancamento.id,
        canal_id=canal_id,
        nome=_extrair_nome(payload),
        email=email,
        telefone=_primeiro(payload, "phone", "Phone", "telefone", "Telefone") or "",
        origem=canal_nome,
    )
    # Data do GHL (campo "Data"/"DATA") tem precedência sobre NOW() do banco
    # — assim o gráfico de velocidade reflete o momento exato da inscrição,
    # não o instante em que o webhook chegou.
    data_inscricao = _extrair_data(payload)
    if data_inscricao is not None:
        lead.criado_em = data_inscricao
    db.add(lead)
    await db.commit()


# ============================================================
# Extração de campos do payload do GHL
# ============================================================
def _extrair_nome(payload: dict) -> str:
    completo = _primeiro(payload, "Nome", "nome", "fullName", "name", "full_name")
    if completo:
        return completo
    first = _primeiro(payload, "firstName", "first_name") or ""
    last = _primeiro(payload, "lastName", "last_name") or ""
    composto = f"{first} {last}".strip()
    return composto or "Sem nome"


def _extrair_canal_bruto(payload: dict) -> str:
    custom = payload.get("customField") or payload.get("custom_field") or {}
    if isinstance(custom, dict):
        candidato = custom.get("canal") or custom.get("source")
        if candidato:
            return str(candidato)

    utm = _primeiro(payload, "utm_source", "utmSource")
    if utm:
        return utm

    tags = payload.get("tags") or []
    if isinstance(tags, list) and tags:
        return str(tags[0])

    # Sem nenhuma origem identificável → "Sem Utm".
    return ""


def _normalizar(valor: str) -> str:
    chave = valor.strip().lower()
    if chave in NORMALIZACAO_CANAL:
        return NORMALIZACAO_CANAL[chave]
    return valor.strip() or "Sem Utm"


def _primeiro(payload: dict, *chaves: str) -> str | None:
    """Retorna o primeiro valor não-vazio encontrado dentre as chaves passadas."""
    for chave in chaves:
        valor = payload.get(chave)
        if valor:
            return str(valor)
    return None


# Formatos aceitos para o campo "Data" enviado pelo GHL
# (right_now.little_endian_date + hora/minuto/segundo).
_FORMATOS_DATA = (
    "%d-%m-%Y %H:%M:%S",
    "%d-%m-%Y %H:%M",
    "%d/%m/%Y %H:%M:%S",
    "%d/%m/%Y %H:%M",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%d %H:%M:%S",
)


def _extrair_data(payload: dict) -> datetime | None:
    """Lê o campo "Data" (ou variantes) do payload e devolve datetime
    timezone-aware em BRT. Retorna None se não tiver ou se não conseguir
    parsear — o caller cai no NOW() do banco."""
    bruto = _primeiro(payload, "Data", "DATA", "data", "data_inscricao")
    if not bruto:
        return None
    bruto = bruto.strip()
    for fmt in _FORMATOS_DATA:
        try:
            dt = datetime.strptime(bruto, fmt)
            return dt.replace(tzinfo=BR_TZ)
        except ValueError:
            continue
    return None


# ============================================================
# Acesso ao banco
# ============================================================
async def _buscar_por_token(db: AsyncSession, token: str) -> Lancamento | None:
    stmt = select(Lancamento).where(Lancamento.webhook_token == token)
    return (await db.execute(stmt)).scalar_one_or_none()


async def _obter_ou_criar_canal(
    db: AsyncSession, lancamento_id: UUID, canal_nome: str
) -> UUID:
    stmt = select(Canal).where(
        Canal.lancamento_id == lancamento_id,
        Canal.nome == canal_nome,
    )
    canal = (await db.execute(stmt)).scalar_one_or_none()
    if not canal:
        canal = Canal(lancamento_id=lancamento_id, nome=canal_nome, investimento=0)
        db.add(canal)
        await db.flush()
    return canal.id
