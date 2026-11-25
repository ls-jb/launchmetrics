"""
Lógica dos Perpétuos.

Cada perpétuo agrupa N ofertas (oferta_codigo) e tem um histórico de
aportes diários. As métricas usam a MESMA regra de venda real do dashboard
(override de ofertas_precos + dedup por email+oferta_codigo + recorrência
seq<=1 + status aprovada), aplicada à janela [inicio, fim] em BRT — onde
inicio default é perpetuo.data_inicio e fim default é hoje.
"""
import re
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

BR_TZ = ZoneInfo("America/Sao_Paulo")

from sqlalchemy import Date, String, and_, case, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from sqlalchemy import delete as sql_delete

from app.models import (
    OfertaPreco,
    Perpetuo,
    PerpetuoAporte,
    PerpetuoOferta,
    Venda,
)
from app.schemas.perpetuo import (
    AporteResponse,
    OfertaDetalhe,
    OfertaDoDia,
    PerpetuoCompleto,
    PerpetuoResponse,
    PontoInvestimentoDia,
    PontoVendaCategoria,
)
from app.services import meta_ads_service
from app.services.perpetuo_resumo_service import (
    TAXA_HOTMART_FIXA,
    TAXA_HOTMART_PCT,
    montar_resumo,
)


# ============================================================
# Heurística de categoria (mesma do guru_service, pra consistência)
# ============================================================
def _categoria_da_oferta(oferta_nome: str | None) -> str:
    """Mapeia nome da oferta pra Principal/Order Bump/Upsell/UpUpsell/
    Downsell/Downsell 2/Outros."""
    nome = (oferta_nome or "").lower()
    if "order bump" in nome or "orderbump" in nome:
        return "Order Bump"
    # UpUpsell precisa vir ANTES do Upsell pra pegar o nome completo
    if "upupsell" in nome or "up upsell" in nome:
        return "UpUpsell"
    if "upsell" in nome:
        return "Upsell"
    # Downsell 2 antes do Downsell, pelo mesmo motivo. \b depois do 2 evita
    # pegar datas ("Downsell 2026").
    if "downdownsell" in nome or re.search(r"\bdown(sell)?\s*2\b", nome):
        return "Downsell 2"
    if "downsell" in nome:
        return "Downsell"
    if "principal" in nome:
        return "Principal"
    return "Outros"


def _categoria_efetiva(oferta: PerpetuoOferta) -> str:
    """Categoria explícita (se cadastrada) OU heurística pelo nome."""
    return oferta.categoria or _categoria_da_oferta(oferta.oferta_nome)


# ============================================================
# CRUD do perpétuo
# ============================================================
async def listar(db: AsyncSession) -> list[Perpetuo]:
    stmt = select(Perpetuo).order_by(Perpetuo.criado_em.desc())
    return list((await db.execute(stmt)).scalars().all())


async def criar(
    db: AsyncSession,
    nome: str,
    data_inicio: date,
    investimento: Decimal,
    produtos: list[str],  # ignorado — legacy do schema, mantido pra compat
) -> Perpetuo:
    # produtos chega vazio agora (UI moveu pra cadastrar ofertas depois).
    # Investimento aqui também é legacy — fonte de verdade são os aportes.
    _ = produtos
    perp = Perpetuo(
        nome=nome,
        data_inicio=data_inicio,
        investimento=investimento or Decimal("0"),
    )
    db.add(perp)
    await db.commit()
    await db.refresh(perp)
    return perp


async def atualizar(
    db: AsyncSession,
    perpetuo_id: UUID,
    nome: str | None,
    data_inicio: date | None,
    investimento: Decimal | None,
    meta_ad_account_id: str | None = None,
    meta_filtro_nome: str | None = None,
    *,
    atualizar_meta: bool = False,
    meta_contas_extras: list[dict] | None = None,
    atualizar_extras: bool = False,
    planilha_url: str | None = None,
    atualizar_planilha: bool = False,
) -> Perpetuo | None:
    perp = await db.get(Perpetuo, perpetuo_id)
    if not perp:
        return None
    if nome is not None:
        perp.nome = nome
    if data_inicio is not None:
        perp.data_inicio = data_inicio
    if investimento is not None:
        perp.investimento = investimento
    # Campos Meta usam flag explícita pra permitir setar como NULL
    # (limpar o vínculo), o que `is not None` não cobre.
    if atualizar_meta:
        perp.meta_ad_account_id = meta_ad_account_id
        perp.meta_filtro_nome = meta_filtro_nome
    # Extras só mudam quando o cliente manda o campo — evita que um PATCH
    # antigo (só par principal) apague as contas adicionais.
    if atualizar_extras:
        perp.meta_contas_extras = meta_contas_extras or None
    # Mesma lógica: flag explícita pra permitir desligar a planilha (NULL).
    if atualizar_planilha:
        perp.planilha_url = planilha_url
    await db.commit()
    await db.refresh(perp)
    return perp


async def remover(db: AsyncSession, perpetuo_id: UUID) -> bool:
    perp = await db.get(Perpetuo, perpetuo_id)
    if not perp:
        return False
    await db.delete(perp)
    await db.commit()
    return True


# ============================================================
# Ofertas do perpétuo
# ============================================================
async def adicionar_oferta(
    db: AsyncSession,
    perpetuo_id: UUID,
    oferta_codigo: str,
    oferta_nome: str | None,
    categoria: str | None = None,
) -> PerpetuoOferta | None:
    if not await db.get(Perpetuo, perpetuo_id):
        return None
    item = PerpetuoOferta(
        perpetuo_id=perpetuo_id,
        oferta_codigo=oferta_codigo.strip(),
        oferta_nome=(oferta_nome or "").strip() or None,
        categoria=categoria,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


_CAMPOS_TEXTO_OFERTA = ("funil", "descricao")


def _normalizar_campos_oferta(campos: dict[str, Any]) -> dict[str, Any]:
    """Limpa os campos enviados no PATCH da oferta (só os enviados chegam
    aqui — exclude_unset). Texto vazio/espaços vira None (limpa o campo);
    oculta=None é ignorado; categoria=None é mantido (volta à heurística)."""
    limpos: dict[str, Any] = {}
    for nome, valor in campos.items():
        if nome in _CAMPOS_TEXTO_OFERTA:
            limpos[nome] = (valor or "").strip() or None
        elif nome == "oculta":
            if valor is not None:
                limpos[nome] = bool(valor)
        elif nome == "categoria":
            limpos[nome] = valor
    return limpos


async def atualizar_oferta(
    db: AsyncSession,
    oferta_id: UUID,
    campos: dict[str, Any],
) -> PerpetuoOferta | None:
    """Atualiza só os campos enviados da oferta (categoria, funil,
    descricao, oculta). categoria=None limpa a categoria explícita."""
    item = await db.get(PerpetuoOferta, oferta_id)
    if not item:
        return None
    for nome, valor in _normalizar_campos_oferta(campos).items():
        setattr(item, nome, valor)
    await db.commit()
    await db.refresh(item)
    return item


async def remover_oferta(db: AsyncSession, oferta_id: UUID) -> bool:
    item = await db.get(PerpetuoOferta, oferta_id)
    if not item:
        return False
    await db.delete(item)
    await db.commit()
    return True


# ============================================================
# Aportes
# ============================================================
async def adicionar_aporte(
    db: AsyncSession,
    perpetuo_id: UUID,
    dia: date,
    valor: Decimal,
    descricao: str | None,
) -> PerpetuoAporte | None:
    if not await db.get(Perpetuo, perpetuo_id):
        return None
    aporte = PerpetuoAporte(
        perpetuo_id=perpetuo_id, dia=dia, valor=valor, descricao=descricao
    )
    db.add(aporte)
    await db.commit()
    await db.refresh(aporte)
    return aporte


async def remover_aporte(db: AsyncSession, aporte_id: UUID) -> bool:
    aporte = await db.get(PerpetuoAporte, aporte_id)
    if not aporte:
        return False
    await db.delete(aporte)
    await db.commit()
    return True


# ============================================================
# Detalhe completo (com filtro de data)
# ============================================================
async def obter(
    db: AsyncSession,
    perpetuo_id: UUID,
    inicio: date | None = None,
    fim: date | None = None,
    categorias: set[str] | None = None,
) -> PerpetuoCompleto | None:
    """`categorias` = filtro "Considerar" da tela; só afeta o `resumo`
    (blocos do topo). None = todas."""
    perp = await db.get(Perpetuo, perpetuo_id)
    if not perp:
        return None

    # Janela efetiva: default = data_inicio..hoje. Frontend manda outra
    # quando o usuário escolhe um período menor.
    inicio_efetivo = inicio or perp.data_inicio
    fim_efetivo = fim or date.today()

    ofertas_cadastradas = await _ofertas_do_perpetuo(db, perpetuo_id)
    detalhes = await _ofertas_com_metricas(
        db, ofertas_cadastradas, inicio_efetivo, fim_efetivo
    )
    aportes = await _aportes_do_perpetuo(db, perpetuo_id)

    # Investimento = aportes só dentro da janela
    investimento_total = sum(
        (Decimal(a.valor) for a in aportes if inicio_efetivo <= a.dia <= fim_efetivo),
        Decimal("0"),
    )

    return PerpetuoCompleto(
        perpetuo=PerpetuoResponse.model_validate(perp),
        inicio=inicio_efetivo,
        fim=fim_efetivo,
        ofertas=detalhes,
        aportes=aportes,
        investimento_total=investimento_total,
        receita_total=sum((d.receita for d in detalhes), Decimal("0")),
        quantidade_total=sum(d.quantidade for d in detalhes),
        resumo=montar_resumo(detalhes, investimento_total, categorias),
    )


async def _ofertas_do_perpetuo(
    db: AsyncSession, perpetuo_id: UUID
) -> list[PerpetuoOferta]:
    stmt = (
        select(PerpetuoOferta)
        .where(PerpetuoOferta.perpetuo_id == perpetuo_id)
        .order_by(PerpetuoOferta.criado_em)
    )
    return list((await db.execute(stmt)).scalars().all())


async def _aportes_do_perpetuo(
    db: AsyncSession, perpetuo_id: UUID
) -> list[AporteResponse]:
    """Todos os aportes (a UI gerencia a lista inteira, sem filtro)."""
    stmt = (
        select(PerpetuoAporte)
        .where(PerpetuoAporte.perpetuo_id == perpetuo_id)
        .order_by(PerpetuoAporte.dia)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [AporteResponse.model_validate(a) for a in rows]


_METRICAS_VAZIAS: dict[str, Any] = {
    "quantidade": 0,
    "receita": Decimal("0"),
    "faturamento_liquido": Decimal("0"),
    "faturamento_bruto": Decimal("0"),
    "valor_vendas": Decimal("0"),
}


async def _metricas_por_oferta(
    db: AsyncSession, codigos: list[str], inicio: date, fim: date
) -> dict[str, dict[str, Any]]:
    """Qtd, receita (preço fixo) e valores reais (líquido/bruto/valor da
    venda) por oferta_codigo, numa query só."""
    inicio_dt, fim_dt = _range_utc(inicio, fim)
    sub = _vendas_efetivas_subquery(codigos, inicio_dt, fim_dt)

    def soma(coluna):
        return func.coalesce(func.sum(coluna), 0)

    stmt = select(
        sub.c.oferta_codigo,
        func.count().label("qtd"),
        soma(sub.c.v).label("receita"),
        soma(sub.c.liquido).label("liquido"),
        soma(sub.c.bruto).label("bruto"),
        soma(sub.c.valor_venda).label("valor_venda"),
    ).group_by(sub.c.oferta_codigo)
    return {
        r.oferta_codigo: {
            "quantidade": int(r.qtd),
            "receita": Decimal(r.receita),
            "faturamento_liquido": Decimal(r.liquido),
            "faturamento_bruto": Decimal(r.bruto),
            "valor_vendas": Decimal(r.valor_venda),
        }
        for r in (await db.execute(stmt)).all()
    }


async def _ofertas_com_metricas(
    db: AsyncSession,
    ofertas: list[PerpetuoOferta],
    inicio: date,
    fim: date,
) -> list[OfertaDetalhe]:
    """Pra cada oferta cadastrada: métricas no período + categoria
    heurística. Vendas batem pelo oferta_codigo exato."""
    if not ofertas:
        return []
    codigos = [o.oferta_codigo for o in ofertas]
    metricas = await _metricas_por_oferta(db, codigos, inicio, fim)
    produto_por_codigo = await _produto_por_codigo(db, codigos)
    preco_por_codigo = await _preco_por_codigo(db, codigos)

    detalhes = [
        OfertaDetalhe(
            id=o.id,
            oferta_codigo=o.oferta_codigo,
            oferta_nome=o.oferta_nome,
            produto=produto_por_codigo.get(o.oferta_codigo),
            categoria=_categoria_efetiva(o),  # type: ignore[arg-type]
            funil=o.funil,
            descricao=o.descricao,
            oculta=bool(o.oculta),
            preco_oferta=preco_por_codigo.get(o.oferta_codigo),
            **metricas.get(o.oferta_codigo, _METRICAS_VAZIAS),
        )
        for o in ofertas
    ]
    # Receita desc; sem venda vai pro fim
    detalhes.sort(key=lambda d: (-d.receita, -d.quantidade, d.oferta_nome or ""))
    return detalhes


async def _preco_por_codigo(
    db: AsyncSession, codigos: list[str]
) -> dict[str, Decimal]:
    """Preço cadastrado (ofertas_precos) de cada oferta — o "ticket" que
    aparece no (?) das etapas do funil."""
    if not codigos:
        return {}
    rows = await db.execute(
        select(OfertaPreco.oferta_codigo, OfertaPreco.valor).where(
            OfertaPreco.oferta_codigo.in_(codigos)
        )
    )
    return {codigo: Decimal(valor) for codigo, valor in rows.all()}


async def _produto_por_codigo(
    db: AsyncSession, codigos: list[str]
) -> dict[str, str]:
    """Nome do produto de cada oferta_codigo, olhando qualquer venda dela
    (todas as vendas da mesma oferta têm o mesmo produto). Sem filtro de
    período: a oferta mostra o produto mesmo sem venda no intervalo.
    MAX devolve 1 valor por código sem risco de erro."""
    if not codigos:
        return {}
    rows = (
        await db.execute(
            select(Venda.oferta_codigo, func.max(Venda.produto).label("produto"))
            .where(Venda.oferta_codigo.in_(codigos))
            .group_by(Venda.oferta_codigo)
        )
    ).all()
    return {r.oferta_codigo: r.produto for r in rows if r.produto}


# ============================================================
# Gráfico diário — vendas por categoria + investimento
# ============================================================
async def vendas_por_dia_categoria(
    db: AsyncSession,
    perpetuo_id: UUID,
    inicio: date | None = None,
    fim: date | None = None,
) -> list[PontoVendaCategoria]:
    """Pontos (dia BRT × categoria) com qtd e receita, no período."""
    perp = await db.get(Perpetuo, perpetuo_id)
    if not perp:
        return []
    inicio_efetivo = inicio or perp.data_inicio
    fim_efetivo = fim or date.today()

    ofertas = list(
        (
            await db.execute(
                select(PerpetuoOferta).where(
                    PerpetuoOferta.perpetuo_id == perpetuo_id
                )
            )
        )
        .scalars()
        .all()
    )
    if not ofertas:
        return []
    codigo_para_cat = {o.oferta_codigo: _categoria_efetiva(o) for o in ofertas}

    inicio_dt, fim_dt = _range_utc(inicio_efetivo, fim_efetivo)
    sub = _vendas_efetivas_subquery(list(codigo_para_cat.keys()), inicio_dt, fim_dt)

    dia_brt = cast(
        func.timezone("America/Sao_Paulo", sub.c.data_venda), Date
    ).label("dia")
    rows = (
        await db.execute(
            select(
                sub.c.oferta_codigo,
                dia_brt,
                func.count().label("qtd"),
                func.coalesce(func.sum(sub.c.v), 0).label("receita"),
            ).group_by(sub.c.oferta_codigo, dia_brt)
        )
    ).all()

    # Soma por (dia × categoria), agregando os códigos da mesma categoria
    agregado: dict[tuple[date, str], tuple[int, Decimal]] = defaultdict(
        lambda: (0, Decimal("0"))
    )
    for r in rows:
        cat = codigo_para_cat[r.oferta_codigo]
        ant_qtd, ant_rec = agregado[(r.dia, cat)]
        agregado[(r.dia, cat)] = (
            ant_qtd + int(r.qtd),
            ant_rec + Decimal(r.receita),
        )

    return [
        PontoVendaCategoria(
            dia=dia,
            categoria=cat,  # type: ignore[arg-type]
            quantidade=qtd,
            receita=receita,
        )
        for (dia, cat), (qtd, receita) in sorted(agregado.items())
    ]


async def vendas_do_dia(
    db: AsyncSession, perpetuo_id: UUID, dia: date
) -> list[OfertaDoDia]:
    """Drill-down do gráfico: dado um dia BR, retorna quais ofertas
    venderam nesse dia no perpétuo. Uma linha por (produto, oferta_nome,
    categoria) — agrupamento de vários oferta_codigo que caem no mesmo
    bucket. Aplica a mesma regra de venda real do dashboard.

    Diferente de LancamentoPagoOferta, PerpetuoOferta NÃO guarda o
    `produto` — ele vem da tabela vendas (pegamos qualquer venda daquela
    oferta_codigo pra descobrir o nome do produto)."""
    perp = await db.get(Perpetuo, perpetuo_id)
    if not perp:
        return []

    ofertas = list(
        (
            await db.execute(
                select(PerpetuoOferta).where(
                    PerpetuoOferta.perpetuo_id == perpetuo_id,
                    PerpetuoOferta.oferta_codigo.is_not(None),
                )
            )
        )
        .scalars()
        .all()
    )
    if not ofertas:
        return []

    codigos = [o.oferta_codigo for o in ofertas]
    codigo_para_meta = {
        o.oferta_codigo: (o.oferta_nome, _categoria_efetiva(o))
        for o in ofertas
    }

    inicio_dt, fim_dt = _range_utc(dia, dia)
    sub = _vendas_efetivas_subquery(codigos, inicio_dt, fim_dt)

    # Agrega vendas do dia por oferta_codigo (sem produto — ele vem em
    # query separada pra não multiplicar as contagens no join).
    rows = (
        await db.execute(
            select(
                sub.c.oferta_codigo,
                func.count().label("qtd"),
                func.coalesce(func.sum(sub.c.v), 0).label("receita"),
            ).group_by(sub.c.oferta_codigo)
        )
    ).all()

    produto_por_codigo = await _produto_por_codigo(
        db, [r.oferta_codigo for r in rows]
    )

    # Agrega por (produto, oferta_nome, categoria) — vários oferta_codigo
    # podem cair na mesma tripla.
    agregado: dict[tuple[str, str | None, str], tuple[int, Decimal, str | None]] = {}
    for r in rows:
        oferta_nome, categoria = codigo_para_meta[r.oferta_codigo]
        produto = produto_por_codigo.get(r.oferta_codigo, "—")
        chave = (produto, oferta_nome, categoria)
        if chave in agregado:
            ant_qtd, ant_rec, ant_cod = agregado[chave]
            agregado[chave] = (
                ant_qtd + int(r.qtd),
                ant_rec + Decimal(r.receita),
                ant_cod,
            )
        else:
            agregado[chave] = (int(r.qtd), Decimal(r.receita), r.oferta_codigo)

    return [
        OfertaDoDia(
            produto=produto,
            oferta_nome=oferta_nome,
            oferta_codigo=codigo,
            categoria=categoria,  # type: ignore[arg-type]
            quantidade=qtd,
            receita=receita,
        )
        for (produto, oferta_nome, categoria), (qtd, receita, codigo) in sorted(
            agregado.items(), key=lambda kv: (-kv[1][1], kv[0][0])
        )
    ]


async def investimento_por_dia(
    db: AsyncSession,
    perpetuo_id: UUID,
    inicio: date | None = None,
    fim: date | None = None,
) -> list[PontoInvestimentoDia]:
    """Soma de aportes por dia dentro do período. Pra barra de investimento
    sobreposta no gráfico."""
    perp = await db.get(Perpetuo, perpetuo_id)
    if not perp:
        return []
    inicio_efetivo = inicio or perp.data_inicio
    fim_efetivo = fim or date.today()

    rows = (
        await db.execute(
            select(
                PerpetuoAporte.dia,
                func.coalesce(func.sum(PerpetuoAporte.valor), 0).label("valor"),
            )
            .where(
                PerpetuoAporte.perpetuo_id == perpetuo_id,
                PerpetuoAporte.dia >= inicio_efetivo,
                PerpetuoAporte.dia <= fim_efetivo,
            )
            .group_by(PerpetuoAporte.dia)
            .order_by(PerpetuoAporte.dia)
        )
    ).all()
    return [PontoInvestimentoDia(dia=r.dia, valor=Decimal(r.valor)) for r in rows]


# ============================================================
# Helpers compartilhados (dedup + override + janela BRT)
# ============================================================
def _range_utc(inicio: date, fim: date) -> tuple[datetime, datetime]:
    """[inicio, fim+1) em BRT convertido pra UTC."""
    inicio_dt = datetime.combine(inicio, time.min, tzinfo=BR_TZ).astimezone(timezone.utc)
    fim_dt = datetime.combine(
        fim + timedelta(days=1), time.min, tzinfo=BR_TZ
    ).astimezone(timezone.utc)
    return inicio_dt, fim_dt


def _vendas_efetivas_subquery(codigos: list[str], inicio_dt, fim_dt):
    """Filtra por oferta_codigo IN codigos, aplica regra de venda real do
    dashboard (status=aprovada, recorrência seq<=1, override de ofertas_precos,
    dedup por email+codigo).

    Dedup considera TODO o histórico — a 1ª compra de cada (email, oferta)
    é a venda efetiva. Filtro de data é aplicado depois do dedup pra
    manter coerência entre filtros (mesma venda aparece sempre no mesmo
    dia, independente do range)."""
    base = _base_vendas_dedup(codigos)
    return (
        select(
            base.c.oferta_codigo,
            base.c.v,
            base.c.liquido,
            base.c.valor_venda,
            base.c.bruto,
            base.c.data_venda,
            base.c.plataforma,
        )
        .where(
            base.c.rn == 1,
            base.c.data_venda >= inicio_dt,
            base.c.data_venda < fim_dt,
        )
        .subquery()
    )


def vendas_efetivas_detalhadas_subquery(codigos: list[str], inicio_dt, fim_dt):
    """Mesma regra de `_vendas_efetivas_subquery`, mas com os dados da venda
    (comprador, método de pagamento e `origin` do payload Hotmart). Usada
    pela Luzi — o dashboard segue na versão enxuta, que não lê o payload."""
    base = _base_vendas_dedup(codigos, detalhado=True)
    return (
        select(base)
        .where(
            base.c.rn == 1,
            base.c.data_venda >= inicio_dt,
            base.c.data_venda < fim_dt,
        )
        .subquery()
    )


def _colunas_valores_reais(valor_efetivo):
    """Valores da venda pros blocos do topo (ver perpetuo_resumo_service).

    Com o líquido real gravado (webhook Hotmart com commissions): usa o que
    a Hotmart mandou — líquido = PRODUCER, valor = preço pago, bruto =
    full_price. Sem ele (vendas antigas, outra moeda, outras plataformas):
    cai no valor efetivo (preço fixo da oferta) e estima a taxa da Hotmart."""
    tem_real = Venda.valor_liquido.is_not(None)
    liquido = case(
        (tem_real, Venda.valor_liquido),
        (
            Venda.plataforma == "Hotmart",
            func.round(valor_efetivo * (1 - TAXA_HOTMART_PCT) - TAXA_HOTMART_FIXA, 2),
        ),
        else_=valor_efetivo,
    )
    valor_venda = case((tem_real, Venda.valor), else_=valor_efetivo)
    bruto = case(
        (tem_real, func.coalesce(Venda.valor_bruto, Venda.valor)),
        else_=valor_efetivo,
    )
    return [
        liquido.label("liquido"),
        valor_venda.label("valor_venda"),
        bruto.label("bruto"),
    ]


def _base_vendas_dedup(codigos: list[str], detalhado: bool = False):
    """Vendas aprovadas (1ª recorrência) das ofertas, com valor efetivo
    (override de ofertas_precos) e `rn` = posição da compra dentro do
    par (email, oferta) — rn=1 é a venda efetiva."""
    valor_efetivo_expr = func.coalesce(OfertaPreco.valor, Venda.valor)
    valor_efetivo = valor_efetivo_expr.label("v")
    dedup_key = case(
        (Venda.forcar_no_dash.is_(True), cast(Venda.id, String)),
        (
            and_(
                Venda.comprador_email.is_not(None),
                Venda.oferta_codigo.is_not(None),
            ),
            Venda.comprador_email + cast(Venda.oferta_codigo, String),
        ),
        else_=cast(Venda.id, String),
    )
    rn = (
        func.row_number()
        .over(partition_by=dedup_key, order_by=Venda.data_venda)
        .label("rn")
    )
    colunas = [
        Venda.oferta_codigo.label("oferta_codigo"),
        valor_efetivo,
        *_colunas_valores_reais(valor_efetivo_expr),
        Venda.data_venda.label("data_venda"),
        Venda.plataforma.label("plataforma"),
        rn,
    ]
    if detalhado:
        colunas += [
            Venda.id.label("venda_id"),
            Venda.comprador_nome.label("comprador_nome"),
            Venda.comprador_email.label("comprador_email"),
            Venda.metodo_pagamento.label("metodo_pagamento"),
            Venda.payload_bruto["data"]["purchase"]["origin"].label("origin"),
        ]
    return (
        select(*colunas)
        .select_from(Venda)
        .outerjoin(OfertaPreco, OfertaPreco.oferta_codigo == Venda.oferta_codigo)
        .where(
            Venda.oferta_codigo.in_(codigos),
            Venda.status == "aprovada",
            or_(Venda.recorrencia_seq.is_(None), Venda.recorrencia_seq == 1),
        )
        .subquery()
    )


DESCRICAO_META = "Meta Ads — sync automático"
"""Marca os aportes vindos da sincronização Meta Ads. Permite diferenciar
do que foi cadastrado manualmente (e refazer o UPSERT só nesses)."""


def _pares_meta(perp: Perpetuo) -> list[tuple[str, str | None]]:
    """Lista de pares (ad_account, filtro): principal + extras. Ignora
    entradas sem ad_account_id (defensivo — JSONB pode vir torto)."""
    pares: list[tuple[str, str | None]] = []
    if perp.meta_ad_account_id:
        pares.append((perp.meta_ad_account_id, perp.meta_filtro_nome))
    for extra in perp.meta_contas_extras or []:
        if not isinstance(extra, dict):
            continue
        ad = (extra.get("ad_account_id") or "").strip()
        if ad:
            pares.append((ad, extra.get("filtro_nome")))
    return pares


async def sincronizar_meta_perpetuo(
    db: AsyncSession,
    perpetuo_id: UUID,
    dias_retroativos: int = 3,
) -> dict:
    """
    Puxa o gasto Meta Ads dos últimos N dias pra esse perpétuo e atualiza
    os aportes (UPSERT). Re-puxar últimos 3 dias por default cobre o
    delay/correção retroativa da Meta.

    Idempotente — apaga só aportes da janela cuja descricao == DESCRICAO_META,
    mantém aportes manuais. Roda mesmo se o perpétuo não tiver Meta
    configurado: nesse caso vira no-op e retorna 0 dias.

    Com `meta_contas_extras`, soma por dia o gasto do par principal + de
    todos os pares extras (cada par puxa independente).

    Retorna {dias: N, total: Decimal, periodo: [inicio, fim]}.
    """
    perp = await db.get(Perpetuo, perpetuo_id)
    pares = _pares_meta(perp) if perp else []
    if not pares:
        return {"dias": 0, "total": Decimal("0"), "periodo": None}

    fim = date.today()
    inicio = fim - timedelta(days=max(dias_retroativos, 0))

    gastos: dict[date, Decimal] = defaultdict(lambda: Decimal("0"))
    for ad_id, filtro in pares:
        gastos_par = await meta_ads_service.puxar_gasto_por_dia(
            ad_id, inicio, fim, filtro
        )
        for dia, valor in (gastos_par or {}).items():
            gastos[dia] += valor
    if not gastos:
        return {
            "dias": 0,
            "total": Decimal("0"),
            "periodo": [inicio.isoformat(), fim.isoformat()],
        }

    # Apaga os aportes da sync nesses dias (preserva aportes manuais)
    await db.execute(
        sql_delete(PerpetuoAporte).where(
            PerpetuoAporte.perpetuo_id == perpetuo_id,
            PerpetuoAporte.dia >= inicio,
            PerpetuoAporte.dia <= fim,
            PerpetuoAporte.descricao == DESCRICAO_META,
        )
    )

    # Insere os novos
    for dia, valor in gastos.items():
        db.add(
            PerpetuoAporte(
                perpetuo_id=perpetuo_id,
                dia=dia,
                valor=valor,
                descricao=DESCRICAO_META,
            )
        )
    await db.commit()

    return {
        "dias": len(gastos),
        "total": sum(gastos.values(), Decimal("0")),
        "periodo": [inicio.isoformat(), fim.isoformat()],
    }


async def sincronizar_meta_todos(db: AsyncSession, dias_retroativos: int = 3) -> dict:
    """Roda sincronizar_meta_perpetuo() pra todo perpétuo com Meta configurado.
    Usado pelo endpoint de cron."""
    stmt = select(Perpetuo).where(
        or_(
            Perpetuo.meta_ad_account_id.is_not(None),
            Perpetuo.meta_contas_extras.is_not(None),
        )
    )
    perps = list((await db.execute(stmt)).scalars().all())
    resultados = []
    for p in perps:
        r = await sincronizar_meta_perpetuo(db, p.id, dias_retroativos)
        resultados.append({"perpetuo": p.nome, **r})
    return {"perpetuos_sincronizados": len(resultados), "detalhes": resultados}


# ============================================================
# Helpers para listar ofertas distintas (pra UI de "adicionar oferta")
# ============================================================
async def listar_ofertas_disponiveis(
    db: AsyncSession,
) -> list[tuple[str, str | None, str | None]]:
    """Retorna tuplas (oferta_codigo, oferta_nome, produto) distintas das
    vendas aprovadas — pra UI mostrar quais ofertas existem pra cadastrar
    no perpétuo."""
    stmt = (
        select(
            Venda.oferta_codigo,
            func.max(Venda.oferta_nome).label("oferta_nome"),
            func.max(Venda.produto).label("produto"),
        )
        .where(Venda.oferta_codigo.is_not(None), Venda.status == "aprovada")
        .group_by(Venda.oferta_codigo)
        .order_by(func.max(Venda.produto), func.max(Venda.oferta_nome))
    )
    rows = (await db.execute(stmt)).all()
    return [(r.oferta_codigo, r.oferta_nome, r.produto) for r in rows]
