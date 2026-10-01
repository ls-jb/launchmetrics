"""
Dados da Luzi — consultas somente leitura sobre as vendas de um perpétuo.

As vendas seguem a MESMA regra de venda real do dashboard (via
`perpetuo_service.vendas_efetivas_detalhadas_subquery`), então os números
batem com os KPIs. A agregação é feita em Python: o volume por perpétuo é
pequeno (centenas a poucos milhares de linhas).

Origem da venda: vem em `payload_bruto.data.purchase.origin` (`xcod`, `src`,
`sck`). O `xcod` chega em dois formatos, conforme o rastreamento da página:
  - JSON (ex. Agenda Cheia): canal (vsrc), código do criativo (co), id do
    anúncio (vid), página (url) e referenciador (r);
  - UTMify (ex. Protocolo Antidor): utm_source, utm_campaign, utm_medium
    (conjunto), utm_content (anúncio) e utm_term (posicionamento), unidos
    pelo separador SEPARADOR_UTMIFY — campanha/conjunto/anúncio no padrão
    "nome|id".
"""
import json
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from urllib.parse import parse_qs
from uuid import UUID

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Perpetuo, PerpetuoOferta, Venda
from app.services import perpetuo_service
from app.services.perpetuo_service import BR_TZ

SEM_ORIGEM = "(sem origem)"
SEPARADOR_UTMIFY = "hQwK21wXxR"
DIAS_SEMANA = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"]

Dimensao = Literal[
    "dia", "semana", "mes", "hora", "dia_semana", "oferta", "categoria",
    "metodo_pagamento", "canal", "campanha", "conjunto", "criativo", "anuncio",
    "posicionamento", "pagina", "referencia",
]
DIMENSOES: tuple[str, ...] = Dimensao.__args__  # type: ignore[attr-defined]


# ============================================================
# Estruturas
# ============================================================
@dataclass(frozen=True)
class OrigemVenda:
    canal: str
    criativo: str
    anuncio_id: str
    pagina: str
    referencia: str
    src: str | None
    sck: str | None
    campanha: str = SEM_ORIGEM
    conjunto: str = SEM_ORIGEM
    posicionamento: str = SEM_ORIGEM


@dataclass(frozen=True)
class OfertaInfo:
    nome: str
    categoria: str


@dataclass(frozen=True)
class ContextoPerpetuo:
    perpetuo_id: UUID
    nome: str
    data_inicio: date
    ofertas: dict[str, OfertaInfo]  # oferta_codigo → info


@dataclass(frozen=True)
class VendaLuzi:
    data_venda: datetime  # em BRT
    oferta_codigo: str
    oferta_nome: str
    categoria: str
    valor: Decimal
    plataforma: str
    comprador_nome: str | None
    comprador_email: str | None
    metodo_pagamento: str | None
    origem: OrigemVenda


# ============================================================
# Origem (xcod / src / sck)
# ============================================================
def extrair_origem(origin: dict[str, Any] | None) -> OrigemVenda:
    """Interpreta `purchase.origin` do payload Hotmart (xcod JSON ou UTMify).
    Campos ausentes viram SEM_ORIGEM — nunca levanta exceção."""
    origin = origin if isinstance(origin, dict) else {}
    src = origin.get("src") or None
    sck = origin.get("sck") or None
    xcod_bruto = origin.get("xcod")
    if isinstance(xcod_bruto, str) and SEPARADOR_UTMIFY in xcod_bruto:
        return _origem_utmify(xcod_bruto, src, sck)
    xcod = _parse_xcod(xcod_bruto)
    co = str(xcod.get("co") or "")
    criativo, _, anuncio_do_co = co.partition("|")
    url = str(xcod.get("url") or "").split("?")[0].rstrip("/")
    return OrigemVenda(
        canal=_ou_sem_origem(xcod.get("vsrc") or _utm_source_do_sck(sck)),
        criativo=_ou_sem_origem(criativo),
        anuncio_id=_ou_sem_origem(xcod.get("vid") or anuncio_do_co),
        pagina=_ou_sem_origem(url),
        referencia=_ou_sem_origem(str(xcod.get("r") or "").rstrip("/")),
        src=src,
        sck=sck,
    )


def _origem_utmify(xcod: str, src: str | None, sck: str | None) -> OrigemVenda:
    """xcod = source SEP campanha|id SEP conjunto|id SEP anúncio|id SEP posicionamento."""
    partes = (xcod.split(SEPARADOR_UTMIFY) + [""] * 5)[:5]
    fonte, campanha, conjunto, anuncio, posicionamento = (p.strip() for p in partes)
    anuncio_nome, _, anuncio_id = anuncio.partition("|")
    return OrigemVenda(
        canal=_ou_sem_origem(fonte or _utm_source_do_sck(sck)),
        criativo=_ou_sem_origem(anuncio_nome),
        anuncio_id=_ou_sem_origem(anuncio_id),
        pagina=SEM_ORIGEM,
        referencia=SEM_ORIGEM,
        src=src,
        sck=sck,
        campanha=_ou_sem_origem(campanha.partition("|")[0]),
        conjunto=_ou_sem_origem(conjunto.partition("|")[0]),
        posicionamento=_ou_sem_origem(posicionamento),
    )


def _utm_source_do_sck(sck: str | None) -> str | None:
    """sck às vezes vem como querystring (ex.: 'utm_source=FB')."""
    if not sck or "utm_source=" not in sck:
        return None
    return (parse_qs(sck).get("utm_source") or [None])[0]


def _parse_xcod(xcod: Any) -> dict[str, Any]:
    if isinstance(xcod, dict):
        return xcod
    if not isinstance(xcod, str) or not xcod.strip():
        return {}
    try:
        valor = json.loads(xcod)
    except ValueError:
        return {}
    return valor if isinstance(valor, dict) else {}


def _origin_do_payload(payload: dict[str, Any] | None) -> dict[str, Any] | None:
    """`data.purchase.origin` do payload bruto, tolerando chaves ausentes."""
    atual: Any = payload
    for chave in ("data", "purchase", "origin"):
        if not isinstance(atual, dict):
            return None
        atual = atual.get(chave)
    return atual if isinstance(atual, dict) else None


def _ou_sem_origem(valor: Any) -> str:
    texto = str(valor or "").strip()
    return texto or SEM_ORIGEM


# ============================================================
# Carregamento
# ============================================================
async def carregar_contexto(
    db: AsyncSession, perpetuo_id: UUID
) -> ContextoPerpetuo | None:
    perp = await db.get(Perpetuo, perpetuo_id)
    if not perp:
        return None
    ofertas = (
        await db.execute(
            select(PerpetuoOferta).where(PerpetuoOferta.perpetuo_id == perpetuo_id)
        )
    ).scalars().all()
    return ContextoPerpetuo(
        perpetuo_id=perp.id,
        nome=perp.nome,
        data_inicio=perp.data_inicio,
        ofertas={
            o.oferta_codigo: OfertaInfo(
                nome=o.oferta_nome or o.oferta_codigo,
                categoria=perpetuo_service._categoria_efetiva(o),
            )
            for o in ofertas
        },
    )


async def carregar_vendas(
    db: AsyncSession, ctx: ContextoPerpetuo, inicio: date, fim: date
) -> list[VendaLuzi]:
    """Vendas efetivas do perpétuo em [inicio, fim] (datas BRT)."""
    if not ctx.ofertas:
        return []
    inicio_dt, fim_dt = perpetuo_service._range_utc(inicio, fim)
    sub = perpetuo_service.vendas_efetivas_detalhadas_subquery(
        list(ctx.ofertas), inicio_dt, fim_dt
    )
    rows = (await db.execute(select(sub).order_by(sub.c.data_venda))).all()
    return [_venda_da_linha(r, ctx) for r in rows]


def _venda_da_linha(r: Any, ctx: ContextoPerpetuo) -> VendaLuzi:
    oferta = ctx.ofertas.get(r.oferta_codigo, OfertaInfo(r.oferta_codigo, "Outros"))
    return VendaLuzi(
        data_venda=r.data_venda.astimezone(BR_TZ),
        oferta_codigo=r.oferta_codigo,
        oferta_nome=oferta.nome,
        categoria=oferta.categoria,
        valor=Decimal(r.v),
        plataforma=r.plataforma,
        comprador_nome=r.comprador_nome,
        comprador_email=r.comprador_email,
        metodo_pagamento=r.metodo_pagamento,
        origem=extrair_origem(r.origin),
    )


async def investimento_periodo(
    db: AsyncSession, ctx: ContextoPerpetuo, inicio: date, fim: date
) -> Decimal:
    pontos = await perpetuo_service.investimento_por_dia(
        db, ctx.perpetuo_id, inicio, fim
    )
    return sum((p.valor for p in pontos), Decimal("0"))


# ============================================================
# Agregações
# ============================================================
def chave_dimensao(venda: VendaLuzi, dimensao: str) -> str:
    d = venda.data_venda
    chaves = {
        "dia": lambda: d.date().isoformat(),
        "semana": lambda: f"{d.isocalendar().year}-S{d.isocalendar().week:02d}",
        "mes": lambda: d.strftime("%Y-%m"),
        "hora": lambda: f"{d.hour:02d}h",
        "dia_semana": lambda: DIAS_SEMANA[d.weekday()],
        "oferta": lambda: venda.oferta_nome,
        "categoria": lambda: venda.categoria,
        "metodo_pagamento": lambda: venda.metodo_pagamento or "(não informado)",
        "canal": lambda: venda.origem.canal,
        "campanha": lambda: venda.origem.campanha,
        "conjunto": lambda: venda.origem.conjunto,
        "criativo": lambda: venda.origem.criativo,
        "anuncio": lambda: venda.origem.anuncio_id,
        "posicionamento": lambda: venda.origem.posicionamento,
        "pagina": lambda: venda.origem.pagina,
        "referencia": lambda: venda.origem.referencia,
    }
    if dimensao not in chaves:
        raise ValueError(f"Dimensão inválida: {dimensao}")
    return chaves[dimensao]()


def agrupar(vendas: list[VendaLuzi], dimensao: str) -> list[dict[str, Any]]:
    """Quantidade, faturamento, ticket médio e % do faturamento por grupo.
    Dimensões de tempo saem em ordem cronológica; as demais, por faturamento."""
    grupos: dict[str, list[Decimal]] = defaultdict(list)
    for v in vendas:
        grupos[chave_dimensao(v, dimensao)].append(v.valor)
    total = sum((v.valor for v in vendas), Decimal("0"))
    linhas = [
        {
            "grupo": chave,
            "quantidade": len(valores),
            "faturamento": _dinheiro(sum(valores, Decimal("0"))),
            "ticket_medio": _dinheiro(sum(valores, Decimal("0")) / len(valores)),
            "pct_faturamento": _pct(sum(valores, Decimal("0")), total),
        }
        for chave, valores in grupos.items()
    ]
    if dimensao in ("dia", "semana", "mes", "hora"):
        return sorted(linhas, key=lambda x: x["grupo"])
    return sorted(linhas, key=lambda x: (-x["faturamento"], -x["quantidade"]))


def resumo(vendas: list[VendaLuzi], investimento: Decimal) -> dict[str, Any]:
    faturamento = sum((v.valor for v in vendas), Decimal("0"))
    return {
        "vendas": len(vendas),
        "faturamento_bruto": _dinheiro(faturamento),
        "ticket_medio": _dinheiro(faturamento / len(vendas)) if vendas else 0.0,
        "investimento_trafego": _dinheiro(investimento),
        "roas_bruto": round(float(faturamento / investimento), 2) if investimento else None,
        "por_categoria": agrupar(vendas, "categoria"),
    }


def conversao_ofertas(vendas: list[VendaLuzi]) -> dict[str, Any]:
    """Dos compradores da oferta Principal (por email), quantos também
    levaram cada outra categoria no período."""
    emails_por_cat: dict[str, set[str]] = defaultdict(set)
    for v in vendas:
        if v.comprador_email:
            emails_por_cat[v.categoria].add(v.comprador_email.lower())
    principais = emails_por_cat.get("Principal", set())
    return {
        "compradores_principal": len(principais),
        "conversao_por_categoria": {
            cat: {
                "compradores": len(emails & principais),
                "pct_dos_compradores_principal": _pct(len(emails & principais), len(principais)),
            }
            for cat, emails in emails_por_cat.items()
            if cat != "Principal"
        },
    }


def filtrar(vendas: list[VendaLuzi], filtros: dict[str, str | None]) -> list[VendaLuzi]:
    """Filtra por igualdade (sem diferenciar maiúsculas) nas dimensões dadas."""
    ativos = {k: v.lower() for k, v in filtros.items() if v}
    return [
        v for v in vendas
        if all(chave_dimensao(v, k).lower() == alvo for k, alvo in ativos.items())
    ]


def venda_para_dict(v: VendaLuzi) -> dict[str, Any]:
    return {
        "data": v.data_venda.strftime("%Y-%m-%d %H:%M"),
        "oferta": v.oferta_nome,
        "categoria": v.categoria,
        "valor": _dinheiro(v.valor),
        "comprador": v.comprador_nome,
        "email": v.comprador_email,
        "metodo_pagamento": v.metodo_pagamento,
        "canal": v.origem.canal,
        "campanha": v.origem.campanha,
        "conjunto": v.origem.conjunto,
        "criativo": v.origem.criativo,
        "anuncio_id": v.origem.anuncio_id,
        "posicionamento": v.origem.posicionamento,
        "pagina": v.origem.pagina,
        "referencia": v.origem.referencia,
    }


# ============================================================
# Consultas fora da regra de venda efetiva
# ============================================================
async def nao_aprovadas(
    db: AsyncSession, ctx: ContextoPerpetuo, inicio: date, fim: date
) -> dict[str, Any]:
    """Reembolsos, cancelamentos e pendentes do período (todas as linhas,
    sem dedup — é o retrato do que a Hotmart reportou)."""
    if not ctx.ofertas:
        return {}
    inicio_dt, fim_dt = perpetuo_service._range_utc(inicio, fim)
    rows = (
        await db.execute(
            select(Venda.status, func.count(), func.coalesce(func.sum(Venda.valor), 0))
            .where(
                Venda.oferta_codigo.in_(list(ctx.ofertas)),
                Venda.status != "aprovada",
                Venda.data_venda >= inicio_dt,
                Venda.data_venda < fim_dt,
            )
            .group_by(Venda.status)
        )
    ).all()
    return {
        status: {"quantidade": int(qtd), "valor": _dinheiro(Decimal(valor))}
        for status, qtd, valor in rows
    }


async def buscar_comprador(
    db: AsyncSession, ctx: ContextoPerpetuo, termo: str, limite: int = 20
) -> list[dict[str, Any]]:
    """Compras (qualquer status) de um email ou nome nas ofertas do perpétuo."""
    if not ctx.ofertas or not termo.strip():
        return []
    padrao = f"%{termo.strip()}%"
    rows = (
        await db.execute(
            select(Venda)
            .where(
                Venda.oferta_codigo.in_(list(ctx.ofertas)),
                or_(Venda.comprador_email.ilike(padrao), Venda.comprador_nome.ilike(padrao)),
            )
            .order_by(Venda.data_venda.desc())
            .limit(limite)
        )
    ).scalars().all()
    return [_compra_para_dict(v, ctx) for v in rows]


def _compra_para_dict(v: Venda, ctx: ContextoPerpetuo) -> dict[str, Any]:
    oferta = ctx.ofertas.get(v.oferta_codigo or "")
    origem = extrair_origem(_origin_do_payload(v.payload_bruto))
    return {
        "data": v.data_venda.astimezone(BR_TZ).strftime("%Y-%m-%d %H:%M"),
        "comprador": v.comprador_nome,
        "email": v.comprador_email,
        "oferta": oferta.nome if oferta else v.oferta_nome,
        "status": v.status,
        "valor": _dinheiro(Decimal(v.valor)),
        "metodo_pagamento": v.metodo_pagamento,
        "canal": origem.canal,
        "campanha": origem.campanha,
        "criativo": origem.criativo,
    }


# ============================================================
# Helpers numéricos
# ============================================================
def _dinheiro(valor: Decimal) -> float:
    return float(round(valor, 2))


def _pct(parte: Decimal | int, total: Decimal | int) -> float:
    return round(float(parte) / float(total) * 100, 1) if total else 0.0
