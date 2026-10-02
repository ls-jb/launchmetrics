"""
Planilha por perpétuo — cada venda das ofertas de um perpétuo cai, em tempo
real, numa planilha Google Sheets própria (ex.: relatório diário do Agenda
Cheia).

Como funciona:
- O perpétuo guarda `planilha_url`: o Web App de um Apps Script colado na
  planilha (código em backend/scripts/planilha_perpetuo.gs). Vazio = desligado.
- `exportar_venda` roda depois do commit de cada venda — é chamado pelo
  `sheets_export_service.exportar`, que Hotmart, Guru e venda manual já
  chamam. Abre sessão própria porque roda como BackgroundTask (a sessão do
  request já fechou).
- `reenviar_historico` manda todas as vendas do perpétuo de uma vez (carga
  inicial ou correção). O Apps Script faz upsert por id_venda, então
  reenviar não duplica linhas.

Regra de venda: a MESMA do dashboard — recorrência seq<=1, dedup por
email+oferta (só a 1ª compra aprovada entra, considerando todo o histórico),
valor da oferta via override de ofertas_precos, a partir de data_inicio.
Só vendas aprovadas (reembolso não interessa pro relatório). Trade-off: venda
aprovada e reembolsada depois continua na planilha — ela já tinha caído.

`exportar_venda` nunca propaga erro: a planilha é secundária ao webhook.
"""
import logging
from collections.abc import Iterable, Sequence
from datetime import datetime, time
from decimal import Decimal
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models import OfertaPreco, Perpetuo, PerpetuoOferta, Venda
from app.services import perpetuo_service
from app.services.luzi_dados_service import (
    SEM_ORIGEM,
    _origin_do_payload,
    extrair_origem,
)
from app.services.perpetuo_service import BR_TZ

logger = logging.getLogger(__name__)

TIMEOUT_S = 30.0
"""Apps Script reescreve a aba inteira a cada envio — leva alguns segundos."""
LOTE = 500
"""Linhas por POST no reenvio do histórico."""


class PlanilhaNaoConfigurada(Exception):
    """O perpétuo não tem planilha_url."""


# ============================================================
# Tempo real (1 venda)
# ============================================================
async def exportar_venda(venda: Venda) -> None:
    """Envia a venda pra planilha de cada perpétuo que contém a oferta.
    Nunca propaga erro."""
    if not _elegivel(venda):
        return
    try:
        async with AsyncSessionLocal() as db:
            destinos = await _perpetuos_com_planilha(db, venda.oferta_codigo)
            if not destinos or await _tem_compra_anterior(db, venda):
                return
            valor = await _valor_da_oferta(db, venda)
        for perp, oferta in destinos:
            if _antes_do_inicio(venda, perp):
                continue
            linha = montar_linha(venda, oferta, valor)
            await _enviar(perp.planilha_url or "", perp.nome, [linha])
    except Exception:
        logger.exception("Falha enviando venda %s pra planilha do perpétuo", venda.id)


def _elegivel(venda: Venda) -> bool:
    return (
        venda.status == "aprovada"
        and bool(venda.oferta_codigo)
        and venda.recorrencia_seq in (None, 1)
    )


async def _perpetuos_com_planilha(
    db: AsyncSession, oferta_codigo: str | None
) -> list[tuple[Perpetuo, PerpetuoOferta]]:
    stmt = (
        select(Perpetuo, PerpetuoOferta)
        .join(PerpetuoOferta, PerpetuoOferta.perpetuo_id == Perpetuo.id)
        .where(
            PerpetuoOferta.oferta_codigo == oferta_codigo,
            Perpetuo.planilha_url.is_not(None),
            Perpetuo.planilha_url != "",
        )
    )
    return [(p, o) for p, o in (await db.execute(stmt)).all()]


async def _tem_compra_anterior(db: AsyncSession, venda: Venda) -> bool:
    """Dedup do dashboard: se o mesmo email já comprou essa oferta antes
    (aprovada), essa venda não é a efetiva."""
    if venda.forcar_no_dash or not venda.comprador_email:
        return False
    stmt = (
        select(Venda.id)
        .where(
            Venda.id != venda.id,
            Venda.comprador_email == venda.comprador_email,
            Venda.oferta_codigo == venda.oferta_codigo,
            Venda.status == "aprovada",
            Venda.forcar_no_dash.is_not(True),
            _filtro_recorrencia(),
            Venda.data_venda < venda.data_venda,
        )
        .limit(1)
    )
    return (await db.execute(stmt)).first() is not None


async def _valor_da_oferta(db: AsyncSession, venda: Venda) -> Decimal:
    preco = await db.get(OfertaPreco, venda.oferta_codigo)
    return preco.valor if preco else venda.valor


# ============================================================
# Reenvio do histórico (carga inicial / correção)
# ============================================================
async def reenviar_historico(db: AsyncSession, perpetuo_id: UUID) -> int | None:
    """Manda todas as vendas efetivas do perpétuo pra planilha. Retorna
    quantas linhas foram enviadas (None se o perpétuo não existe). Aqui o
    erro propaga — quem chamou (admin na tela) precisa saber se falhou."""
    perp = await db.get(Perpetuo, perpetuo_id)
    if not perp:
        return None
    if not perp.planilha_url:
        raise PlanilhaNaoConfigurada()
    ofertas = await _ofertas_do_perpetuo(db, perp.id)
    if not ofertas:
        return 0
    vendas = await _vendas_com_valor(db, list(ofertas))
    linhas = [
        montar_linha(v, ofertas[v.oferta_codigo or ""], valor)
        for v, valor in selecionar_efetivas(vendas)
        if not _antes_do_inicio(v, perp)
    ]
    for i in range(0, len(linhas), LOTE):
        await _enviar(perp.planilha_url, perp.nome, linhas[i : i + LOTE])
    return len(linhas)


async def _ofertas_do_perpetuo(
    db: AsyncSession, perpetuo_id: UUID
) -> dict[str, PerpetuoOferta]:
    stmt = select(PerpetuoOferta).where(PerpetuoOferta.perpetuo_id == perpetuo_id)
    return {o.oferta_codigo: o for o in (await db.execute(stmt)).scalars()}


async def _vendas_com_valor(
    db: AsyncSession, codigos: list[str]
) -> list[tuple[Venda, Decimal]]:
    """Todas as vendas (histórico inteiro, pro dedup) em ordem cronológica,
    com o valor da oferta já resolvido."""
    stmt = (
        select(Venda, OfertaPreco.valor)
        .outerjoin(OfertaPreco, OfertaPreco.oferta_codigo == Venda.oferta_codigo)
        .where(
            Venda.oferta_codigo.in_(codigos),
            Venda.status == "aprovada",
            _filtro_recorrencia(),
        )
        .order_by(Venda.data_venda)
    )
    linhas = (await db.execute(stmt)).all()
    return [(v, preco if preco is not None else v.valor) for v, preco in linhas]


def selecionar_efetivas(
    vendas: Iterable[tuple[Venda, Decimal]],
) -> list[tuple[Venda, Decimal]]:
    """Aplica o dedup do dashboard sobre vendas aprovadas em ordem
    cronológica: depois da 1ª compra de (email, oferta), as seguintes são
    descartadas."""
    ja_compraram: set[tuple[str, str]] = set()
    efetivas: list[tuple[Venda, Decimal]] = []
    for venda, valor in vendas:
        chave = _chave_dedup(venda)
        if chave is not None and chave in ja_compraram:
            continue
        efetivas.append((venda, valor))
        if chave is not None:
            ja_compraram.add(chave)
    return efetivas


def _chave_dedup(venda: Venda) -> tuple[str, str] | None:
    if venda.forcar_no_dash or not venda.comprador_email or not venda.oferta_codigo:
        return None
    return (venda.comprador_email, venda.oferta_codigo)


# ============================================================
# Linha da planilha
# ============================================================
def montar_linha(venda: Venda, oferta: PerpetuoOferta, valor: Decimal) -> dict[str, Any]:
    """Uma linha por venda. As chaves casam com COLUNAS do Apps Script."""
    origem = extrair_origem(_origin_do_payload(venda.payload_bruto))
    return {
        # Chave do upsert. Venda manual não tem external_id — usa o uuid.
        "id_venda": str(venda.external_id or f"manual_{venda.id}"),
        "data_hora": venda.data_venda.astimezone(BR_TZ).isoformat(),
        "produto": venda.produto,
        "oferta": oferta.oferta_nome or venda.oferta_nome or venda.oferta or "",
        "categoria": perpetuo_service._categoria_efetiva(oferta),
        "valor_bruto": float(valor),
        "plataforma": venda.plataforma,
        "canal": _limpo(origem.canal),
        "campanha": _limpo(origem.campanha),
        "conjunto": _limpo(origem.conjunto),
        "criativo": _limpo(origem.criativo),
        "anuncio_id": _limpo(origem.anuncio_id),
        "posicionamento": _limpo(origem.posicionamento),
        "pagina": _limpo(origem.pagina),
        "referencia": _limpo(origem.referencia),
        "src": origem.src or "",
        "sck": origem.sck or "",
    }


def _limpo(valor: str) -> str:
    """Na planilha, célula vazia é mais legível que '(sem origem)'."""
    return "" if valor == SEM_ORIGEM else valor


# ============================================================
# Helpers
# ============================================================
def _antes_do_inicio(venda: Venda, perp: Perpetuo) -> bool:
    inicio = datetime.combine(perp.data_inicio, time.min, tzinfo=BR_TZ)
    return venda.data_venda < inicio


def _filtro_recorrencia():
    return or_(Venda.recorrencia_seq.is_(None), Venda.recorrencia_seq == 1)


async def _enviar(url: str, aba: str, linhas: Sequence[dict[str, Any]]) -> None:
    async with httpx.AsyncClient(timeout=TIMEOUT_S) as cli:
        resp = await cli.post(
            url, json={"aba": aba, "linhas": list(linhas)}, follow_redirects=True
        )
    resp.raise_for_status()
    corpo = _json_ou_vazio(resp)
    if corpo.get("ok") is not True:
        raise RuntimeError(f"Apps Script não confirmou a gravação: {resp.text[:200]}")


def _json_ou_vazio(resp: httpx.Response) -> dict[str, Any]:
    try:
        corpo = resp.json()
    except ValueError:
        return {}
    return corpo if isinstance(corpo, dict) else {}
