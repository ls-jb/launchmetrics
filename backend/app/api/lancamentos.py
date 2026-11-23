from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.auth import verify_token
from app.schemas.lancamento import (
    CanalUpdate,
    LancamentoCreate,
    LancamentoResponse,
    LancamentoUpdate,
    LeadsPorUtmContent,
    PontoVelocidade,
    SendflowLeadsResponse,
)
from app.schemas.lancamento_vendas import LancamentoVendasPainel, VinculoOferta
from app.services import (
    lancamento_service,
    lancamento_vendas_service,
    pasta_service,
    sendflow_service,
)

router = APIRouter(prefix="/lancamentos", tags=["lancamentos"])


async def _exigir_pasta(db: AsyncSession, pasta_id: UUID | None) -> None:
    """404 se a pasta informada não existe (sem isso o banco devolveria um
    erro de chave estrangeira difícil de entender)."""
    if pasta_id is not None and not await pasta_service.existe(db, pasta_id):
        raise HTTPException(status_code=404, detail="Pasta não encontrada")


@router.get("", response_model=list[LancamentoResponse])
async def listar_lancamentos(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    return await lancamento_service.listar(db)


@router.post("", response_model=LancamentoResponse, status_code=status.HTTP_201_CREATED)
async def criar_lancamento(
    dados: LancamentoCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    await _exigir_pasta(db, dados.pasta_id)
    return await lancamento_service.criar(db, dados)


@router.get("/{id}", response_model=LancamentoResponse)
async def obter_lancamento(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    lancamento = await lancamento_service.obter(db, id)
    if not lancamento:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado")
    return lancamento


@router.get("/{id}/velocidade-leads", response_model=list[PontoVelocidade])
async def velocidade_leads_lancamento(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    return await lancamento_service.velocidade_leads(db, id)


@router.patch("/{id}", response_model=LancamentoResponse)
async def atualizar_lancamento(
    id: UUID,
    dados: LancamentoUpdate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    await _exigir_pasta(db, dados.pasta_id)
    lancamento = await lancamento_service.atualizar(db, id, dados)
    if not lancamento:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado")
    return lancamento


@router.get("/{id}/vendas", response_model=LancamentoVendasPainel)
async def painel_vendas(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    """Tela do dashboard de vendas: KPIs, ofertas/produtos selecionados,
    vendas por oferta e receita por dia — no período do lançamento."""
    lancamento = await lancamento_service.obter(db, id)
    if not lancamento:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado")
    return await lancamento_vendas_service.painel(db, lancamento)


@router.put("/{id}/ofertas", response_model=LancamentoVendasPainel)
async def definir_ofertas(
    id: UUID,
    itens: list[VinculoOferta],
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    """Troca a seleção de ofertas/produtos do dashboard de vendas pela
    lista enviada (estado final das caixinhas) e devolve o painel já
    recalculado."""
    if not await lancamento_vendas_service.substituir_vinculos(db, id, itens):
        raise HTTPException(status_code=404, detail="Lançamento não encontrado")
    lancamento = await lancamento_service.obter(db, id)
    if not lancamento:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado")
    return await lancamento_vendas_service.painel(db, lancamento)


@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def deletar_lancamento(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    sucesso = await lancamento_service.deletar(db, id)
    if not sucesso:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado")


@router.get(
    "/{id}/canais/{canal_id}/utm-content",
    response_model=list[LeadsPorUtmContent],
)
async def leads_por_utm_content(
    id: UUID,
    canal_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    """Drill-down: leads agrupados por utm_content dentro do canal."""
    return await lancamento_service.leads_por_utm_content(db, id, canal_id)


@router.patch("/{id}/canais", response_model=LancamentoResponse)
async def atualizar_canais_lancamento(
    id: UUID,
    atualizacoes: list[CanalUpdate],
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    lancamento = await lancamento_service.atualizar_canais(db, id, atualizacoes)
    if not lancamento:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado")
    return lancamento


@router.post("/{id}/sync-meta")
async def sync_meta(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    """Puxa gasto Meta Ads no período [data_inicio, data_fim] e atualiza
    o canal 'Meta Ads' do lançamento (cria se não existir)."""
    if not await lancamento_service.obter(db, id):
        raise HTTPException(status_code=404, detail="Lançamento não encontrado.")
    return await lancamento_service.sincronizar_meta(db, id)


@router.get("/{id}/sendflow-leads", response_model=SendflowLeadsResponse)
async def sendflow_leads(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    """Puxa on-demand o total de participantes dos grupos WhatsApp da
    campanha SendFlow vinculada ao lançamento. 502 se a API do
    SendFlow falhar — o frontend usa isso pra manter o último valor
    conhecido em vez de zerar o card."""
    from app.models import Lancamento

    lanc = await db.get(Lancamento, id)
    if not lanc:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado.")
    if not lanc.sendflow_release_id:
        return SendflowLeadsResponse(total=0, grupos_count=0, release_id="")
    try:
        return SendflowLeadsResponse(
            **(await sendflow_service.leads_no_grupo(lanc.sendflow_release_id))
        )
    except sendflow_service.SendflowError as e:
        raise HTTPException(status_code=502, detail=f"SendFlow: {e}")


@router.get("/{id}/sendflow-debug")
async def sendflow_debug(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    """Diagnóstico do SendFlow — não expõe o token, retorna: token
    presente sim/não, URL chamada, status HTTP e primeiros 300 chars da
    resposta. Pra distinguir 'token ausente' x 'release_id vazio' x
    'API errada'."""
    from app.models import Lancamento

    lanc = await db.get(Lancamento, id)
    if not lanc:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado.")
    return await sendflow_service.diagnostico(lanc.sendflow_release_id)
