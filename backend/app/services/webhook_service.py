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
    "paid_metaads": "Meta Ads",
    "paid metaads": "Meta Ads",
    "instagram": "Meta Ads",
    "ig": "Meta Ads",
    "google": "Google Ads",
    "google-ads": "Google Ads",
    "googleads": "Google Ads",
    "google ads": "Google Ads",
    "paid_google": "Google Ads",
    "whatsapp": "WhatsApp",
    "wpp": "WhatsApp",
    "organic_whatsapp": "WhatsApp",
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

    # O GHL manda dois conjuntos no payload: TOPO = dados do contato
    # (persistidos, ex. utm_source antigo de uma campanha anterior) e
    # customData = o que o workflow injetou da submissão atual via
    # {{inboundWebhookRequest.fields.X.value}}. customData é o que reflete
    # a inscrição de AGORA, então sempre prefere ele.
    fontes = _fontes(payload)

    email = (_pegar(fontes, "email", "Email") or "").strip()
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

    canal_bruto = _extrair_canal_bruto(fontes)
    # Regra específica do lançamento "Semana da Profissionalização Terapêutica":
    # o gestor de tráfego usa utm_source dinâmico ({{placement}}) gerando
    # valores tipo meta_Instagram_Feed, meta_Facebook_Stories, fb... — tudo
    # com "meta" ou exatamente "fb" cai em Meta Ads. Outros lançamentos
    # seguem a normalização global padrão.
    canal_nome = _normalizar_por_lancamento(canal_bruto, lancamento.nome)
    # WhatsApp tem duas naturezas distintas com custos diferentes: grupos
    # (orgânico, gratuito) e API (pago). Separamos pelo utm_medium pra
    # cada um virar um canal com investimento e CPL próprios.
    if canal_nome == "WhatsApp":
        canal_nome = _split_whatsapp(_pegar(fontes, "utm_medium", "utmMedium"))
    canal_id = await _obter_ou_criar_canal(db, lancamento.id, canal_nome)

    lead = Lead(
        lancamento_id=lancamento.id,
        canal_id=canal_id,
        nome=_extrair_nome(fontes),
        email=email,
        telefone=_pegar(fontes, "phone", "Phone", "telefone", "Telefone") or "",
        origem=canal_nome,
        utm_content=_pegar(fontes, "utm_content", "utmContent") or None,
    )
    # Data do GHL (campo "Data"/"DATA") tem precedência sobre NOW() do banco
    # — assim o gráfico de velocidade reflete o momento exato da inscrição,
    # não o instante em que o webhook chegou.
    data_inscricao = _extrair_data(fontes)
    if data_inscricao is not None:
        lead.criado_em = data_inscricao
    db.add(lead)
    await db.commit()


# ============================================================
# Extração de campos do payload do GHL
# ============================================================
def _fontes(payload: dict) -> list[dict]:
    """Devolve as camadas do payload em ordem de prioridade: primeiro o
    customData (submissão atual, populado pelo workflow do GHL via
    {{inboundWebhookRequest.fields.X.value}}), depois o topo (dados do
    contato persistido — pode ter utm_source antigo de campanha anterior)."""
    custom = payload.get("customData")
    if not isinstance(custom, dict):
        custom = {}
    return [custom, payload]


def _pegar(fontes: list[dict], *chaves: str) -> str | None:
    """Procura nas camadas (customData → topo) o primeiro valor não-vazio
    dentre as chaves passadas. customData sempre ganha."""
    for fonte in fontes:
        for chave in chaves:
            valor = fonte.get(chave)
            if valor:
                return str(valor)
    return None


def _extrair_nome(fontes: list[dict]) -> str:
    completo = _pegar(fontes, "Nome", "nome", "fullName", "name", "full_name")
    if completo:
        return completo
    first = _pegar(fontes, "firstName", "first_name") or ""
    last = _pegar(fontes, "lastName", "last_name") or ""
    composto = f"{first} {last}".strip()
    return composto or "Sem nome"


def _extrair_canal_bruto(fontes: list[dict]) -> str:
    # 1) utm_source da submissão atual (customData) — fonte mais confiável.
    # 2) utm_source do topo (contato GHL) — pode estar com valor antigo.
    # 3) vk_source como último recurso, antes de tags.
    utm = _pegar(fontes, "utm_source", "utmSource")
    if utm:
        return utm

    vk = _pegar(fontes, "vk_source", "vkSource")
    if vk:
        return vk

    # tags só existem no topo (contato), mas é o último fallback mesmo.
    tags = (fontes[-1].get("tags") if fontes else None) or []
    if isinstance(tags, list) and tags:
        return str(tags[0])

    return ""


def _normalizar(valor: str) -> str:
    chave = valor.strip().lower()
    if chave in NORMALIZACAO_CANAL:
        return NORMALIZACAO_CANAL[chave]
    return valor.strip() or "Sem Utm"


def _normalizar_por_lancamento(canal_bruto: str, lancamento_nome: str) -> str:
    """Algumas lançamentos têm regras de UTM próprias do gestor de tráfego.
    SPT (Semana da Profissionalização Terapêutica): qualquer utm com 'meta',
    'instagram' ou exatamente 'fb' / 'ig' vira Meta Ads — porque o gestor
    manda placement dinâmico no utm_source (meta_Instagram_Feed,
    meta_Facebook_Stories…) e às vezes vem 'instagram' solto também.
    Demais lançamentos seguem a normalização global."""
    nome = (lancamento_nome or "").lower()
    bruto = (canal_bruto or "").strip().lower()
    if "profissionaliza" in nome and "terap" in nome:
        if "meta" in bruto or "instagram" in bruto or bruto in ("fb", "ig"):
            return "Meta Ads"
    return _normalizar(canal_bruto)


def _split_whatsapp(utm_medium: str | None) -> str:
    """WhatsApp tem 2 origens com custos distintos: grupos (orgânico,
    gratuito) e API (pago). Decidido pelo utm_medium da submissão atual.
    Default é Grupos — se vier dúvida, classifica como gratuito (não infla
    o CPL da API com leads não pagos)."""
    m = (utm_medium or "").strip().lower()
    if m.startswith("api"):
        return "WhatsApp - API"
    return "WhatsApp - Grupos"


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


def _extrair_data(fontes: list[dict]) -> datetime | None:
    """Lê o campo "Data" (ou variantes) e devolve datetime timezone-aware
    em BRT. Procura primeiro no customData (data injetada pelo workflow
    com {{right_now}}), depois no topo. Retorna None se não tiver ou se
    não conseguir parsear — o caller cai no NOW() do banco."""
    bruto = _pegar(fontes, "Data", "DATA", "data", "data_inscricao")
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
