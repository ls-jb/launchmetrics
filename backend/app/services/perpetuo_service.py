"""
Lógica dos Perpétuos.

Perpétuo = agrupamento de produtos vendidos continuamente, sem janela de
lançamento. As métricas usam a MESMA regra de venda real do dashboard
(override de ofertas_precos + dedup por email+oferta_codigo + recorrência
seq<=1 + status aprovada), aplicada à janela [data_inicio, hoje] em BRT.
"""
from collections import defaultdict
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

BR_TZ = ZoneInfo("America/Sao_Paulo")

from sqlalchemy import Date, String, and_, case, cast, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    OfertaPreco,
    Perpetuo,
    PerpetuoAporte,
    PerpetuoProduto,
    Venda,
)
from app.schemas.perpetuo import (
    AporteResponse,
    OfertaBreakdownProduto,
    PerpetuoCompleto,
    PerpetuoResponse,
    PontoVendaProduto,
    ProdutoDetalhe,
)


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
    produtos: list[str],
) -> Perpetuo:
    perp = Perpetuo(
        nome=nome,
        data_inicio=data_inicio,
        investimento=investimento or Decimal("0"),
    )
    db.add(perp)
    await db.flush()  # gera o id
    # produtos vêm na criação como conveniência; dedup por nome
    vistos: set[str] = set()
    for p in produtos:
        nome_p = (p or "").strip()
        if not nome_p or nome_p in vistos:
            continue
        vistos.add(nome_p)
        db.add(PerpetuoProduto(perpetuo_id=perp.id, produto=nome_p))
    await db.commit()
    await db.refresh(perp)
    return perp


async def atualizar(
    db: AsyncSession,
    perpetuo_id: UUID,
    nome: str | None,
    data_inicio: date | None,
    investimento: Decimal | None,
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
# Produtos do perpétuo
# ============================================================
async def adicionar_produto(
    db: AsyncSession, perpetuo_id: UUID, produto: str
) -> PerpetuoProduto | None:
    if not await db.get(Perpetuo, perpetuo_id):
        return None
    item = PerpetuoProduto(perpetuo_id=perpetuo_id, produto=produto.strip())
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def remover_produto(db: AsyncSession, produto_id: UUID) -> bool:
    item = await db.get(PerpetuoProduto, produto_id)
    if not item:
        return False
    await db.delete(item)
    await db.commit()
    return True


# ============================================================
# Detalhe completo (com métricas reais)
# ============================================================
async def obter(
    db: AsyncSession, perpetuo_id: UUID
) -> PerpetuoCompleto | None:
    perp = await db.get(Perpetuo, perpetuo_id)
    if not perp:
        return None

    produtos_cadastrados = list(
        (
            await db.execute(
                select(PerpetuoProduto)
                .where(PerpetuoProduto.perpetuo_id == perpetuo_id)
                .order_by(PerpetuoProduto.criado_em)
            )
        )
        .scalars()
        .all()
    )

    detalhes = await _produtos_com_metricas(db, perp, produtos_cadastrados)

    aportes_rows = list(
        (
            await db.execute(
                select(PerpetuoAporte)
                .where(PerpetuoAporte.perpetuo_id == perpetuo_id)
                .order_by(PerpetuoAporte.dia)
            )
        )
        .scalars()
        .all()
    )
    aportes = [AporteResponse.model_validate(a) for a in aportes_rows]
    investimento_total = sum((a.valor for a in aportes), Decimal("0"))

    return PerpetuoCompleto(
        perpetuo=PerpetuoResponse.model_validate(perp),
        produtos=detalhes,
        aportes=aportes,
        investimento_total=investimento_total,
    )


# ============================================================
# Aportes (histórico de investimento por dia)
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


async def _produtos_com_metricas(
    db: AsyncSession,
    perp: Perpetuo,
    produtos: list[PerpetuoProduto],
) -> list[ProdutoDetalhe]:
    """Pra cada produto cadastrado: agrega qtd+receita totais e devolve
    breakdown por oferta (oferta_codigo). Vendas batem pelo NOME do produto
    (vendas.produto exato)."""
    if not produtos:
        return []

    nomes = [p.produto for p in produtos]
    hoje = date.today()
    inicio_dt, fim_dt = _range_utc(perp.data_inicio, hoje)

    # Subquery: vendas efetivas no perpétuo (dedup, recorrência, override).
    sub = _vendas_efetivas_subquery(nomes, inicio_dt, fim_dt)

    rows = (
        await db.execute(
            select(
                sub.c.produto,
                sub.c.oferta_codigo,
                sub.c.oferta_nome,
                func.count().label("qtd"),
                func.coalesce(func.sum(sub.c.v), 0).label("receita"),
            ).group_by(sub.c.produto, sub.c.oferta_codigo, sub.c.oferta_nome)
        )
    ).all()

    # Agrega por produto
    por_produto: dict[str, dict] = defaultdict(
        lambda: {"qtd": 0, "receita": Decimal("0"), "ofertas": []}
    )
    for r in rows:
        bucket = por_produto[r.produto]
        bucket["qtd"] += int(r.qtd)
        bucket["receita"] += Decimal(r.receita)
        bucket["ofertas"].append(
            OfertaBreakdownProduto(
                oferta_codigo=r.oferta_codigo,
                oferta_nome=r.oferta_nome,
                quantidade=int(r.qtd),
                receita=Decimal(r.receita),
            )
        )

    detalhes: list[ProdutoDetalhe] = []
    for p in produtos:
        b = por_produto.get(p.produto, {"qtd": 0, "receita": Decimal("0"), "ofertas": []})
        ofertas_sorted = sorted(
            b["ofertas"], key=lambda o: (-o.receita, -o.quantidade)
        )
        detalhes.append(
            ProdutoDetalhe(
                id=p.id,
                produto=p.produto,
                quantidade=b["qtd"],
                receita=b["receita"],
                ofertas=ofertas_sorted,
            )
        )
    # Ordena por receita desc (produtos sem venda vão pro fim)
    detalhes.sort(key=lambda d: (-d.receita, -d.quantidade, d.produto))
    return detalhes


# ============================================================
# Vendas diárias por produto (gráfico com checkboxes)
# ============================================================
async def vendas_por_dia_produto(
    db: AsyncSession, perpetuo_id: UUID
) -> list[PontoVendaProduto]:
    """Pontos (dia BRT × produto) com qtd e receita. Frontend usa pra
    montar o gráfico com checkboxes."""
    perp = await db.get(Perpetuo, perpetuo_id)
    if not perp:
        return []
    produtos = list(
        (
            await db.execute(
                select(PerpetuoProduto.produto).where(
                    PerpetuoProduto.perpetuo_id == perpetuo_id
                )
            )
        )
        .scalars()
        .all()
    )
    if not produtos:
        return []

    hoje = date.today()
    inicio_dt, fim_dt = _range_utc(perp.data_inicio, hoje)
    sub = _vendas_efetivas_subquery(produtos, inicio_dt, fim_dt)

    dia_brt = cast(
        func.timezone("America/Sao_Paulo", sub.c.data_venda), Date
    ).label("dia")
    stmt = (
        select(
            sub.c.produto,
            dia_brt,
            func.count().label("qtd"),
            func.coalesce(func.sum(sub.c.v), 0).label("receita"),
        )
        .group_by(sub.c.produto, dia_brt)
        .order_by(dia_brt, sub.c.produto)
    )
    rows = (await db.execute(stmt)).all()
    return [
        PontoVendaProduto(
            dia=r.dia,
            produto=r.produto,
            quantidade=int(r.qtd),
            receita=Decimal(r.receita),
        )
        for r in rows
    ]


# ============================================================
# Helpers compartilhados (dedup + override + janela BRT)
# ============================================================
def _range_utc(inicio: date, fim: date) -> tuple[datetime, datetime]:
    """Converte [inicio, fim+1) em BRT pra UTC — janela do filtro."""
    inicio_dt = datetime.combine(inicio, time.min, tzinfo=BR_TZ).astimezone(timezone.utc)
    fim_dt = datetime.combine(
        fim + timedelta(days=1), time.min, tzinfo=BR_TZ
    ).astimezone(timezone.utc)
    return inicio_dt, fim_dt


def _vendas_efetivas_subquery(produtos: list[str], inicio_dt, fim_dt):
    """Replica a regra do dashboard pra os produtos do perpétuo. Filtra por
    NOME (vendas.produto in produtos), não por oferta_codigo, porque o
    perpétuo agrega TODAS as ofertas de um produto."""
    valor_efetivo = func.coalesce(OfertaPreco.valor, Venda.valor).label("v")
    dedup_key = case(
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
    base = (
        select(
            Venda.produto.label("produto"),
            Venda.oferta_codigo.label("oferta_codigo"),
            Venda.oferta_nome.label("oferta_nome"),
            valor_efetivo,
            Venda.data_venda.label("data_venda"),
            rn,
        )
        .select_from(Venda)
        .outerjoin(OfertaPreco, OfertaPreco.oferta_codigo == Venda.oferta_codigo)
        .where(
            Venda.produto.in_(produtos),
            Venda.status == "aprovada",
            or_(Venda.recorrencia_seq.is_(None), Venda.recorrencia_seq == 1),
            Venda.data_venda >= inicio_dt,
            Venda.data_venda < fim_dt,
        )
        .subquery()
    )
    return (
        select(
            base.c.produto,
            base.c.oferta_codigo,
            base.c.oferta_nome,
            base.c.v,
            base.c.data_venda,
        )
        .where(base.c.rn == 1)
        .subquery()
    )
