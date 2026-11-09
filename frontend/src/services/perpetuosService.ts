import { api } from './api'
import type {
  CategoriaPerpetuo,
  CategoriaVsl,
  MetaContaExtra,
  OfertaDisponivel,
  OfertaDoDiaPerp,
  Perpetuo,
  PerpetuoAporte,
  PerpetuoCompleto,
  PontoInvestimentoDia,
  PontoVendaCategoriaPerp,
  VslAnalise,
  VslCurva,
  VslPainel,
  VturbPlayerDisponivel,
  VturbPlayerVinculo,
} from '@/types'

export interface NovoPerpetuoPayload {
  nome: string
  data_inicio: string // YYYY-MM-DD
  investimento?: number | null
}

export interface AtualizarPerpetuoPayload {
  nome?: string
  data_inicio?: string
  investimento?: number | null
  meta_ad_account_id?: string | null
  meta_filtro_nome?: string | null
  meta_contas_extras?: MetaContaExtra[] | null
  planilha_url?: string | null
}

export interface NovoAportePayload {
  dia: string // YYYY-MM-DD
  valor: number
  descricao?: string | null
}

export interface NovaOfertaPayload {
  oferta_codigo: string
  oferta_nome?: string | null
  /** Categoria explícita. Se omitida ou null, o backend usa a heurística
   * pelo nome (Principal / Order Bump / etc). */
  categoria?: CategoriaPerpetuo | null
}

export interface AtualizarOfertaPayload {
  /** null limpa a categoria explícita — volta à heurística. */
  categoria: CategoriaPerpetuo | null
}

export interface NovoVturbPlayerPayload {
  player_id: string
  player_nome?: string | null
  categoria: CategoriaVsl
}

function paramsPeriodo(inicio?: string, fim?: string) {
  const params: Record<string, string> = {}
  if (inicio) params.inicio = inicio
  if (fim) params.fim = fim
  return { params }
}

export const perpetuosService = {
  listar: () =>
    api.get<Perpetuo[]>('/api/perpetuos').then((r) => r.data),

  obter: (id: string, inicio?: string, fim?: string) =>
    api
      .get<PerpetuoCompleto>(`/api/perpetuos/${id}`, paramsPeriodo(inicio, fim))
      .then((r) => r.data),

  criar: (dados: NovoPerpetuoPayload) =>
    api.post<Perpetuo>('/api/perpetuos', dados).then((r) => r.data),

  atualizar: (id: string, dados: AtualizarPerpetuoPayload) =>
    api.patch<Perpetuo>(`/api/perpetuos/${id}`, dados).then((r) => r.data),

  remover: (id: string) =>
    api.delete(`/api/perpetuos/${id}`).then(() => undefined),

  // Ofertas cadastradas no perpétuo
  adicionarOferta: (perpetuoId: string, dados: NovaOfertaPayload) =>
    api
      .post<{ id: string; oferta_codigo: string; oferta_nome: string | null }>(
        `/api/perpetuos/${perpetuoId}/ofertas`,
        dados,
      )
      .then((r) => r.data),

  atualizarOferta: (ofertaId: string, dados: AtualizarOfertaPayload) =>
    api
      .patch<{
        id: string
        oferta_codigo: string
        oferta_nome: string | null
        categoria: CategoriaPerpetuo | null
      }>(`/api/perpetuos/ofertas/${ofertaId}`, dados)
      .then((r) => r.data),

  removerOferta: (ofertaId: string) =>
    api
      .delete(`/api/perpetuos/ofertas/${ofertaId}`)
      .then(() => undefined),

  // Ofertas disponíveis pra cadastrar (vem das vendas aprovadas)
  ofertasDisponiveis: () =>
    api
      .get<OfertaDisponivel[]>('/api/perpetuos/_meta/ofertas-disponiveis')
      .then((r) => r.data),

  // Gráfico: 2 séries paralelas
  vendasPorDia: (id: string, inicio?: string, fim?: string) =>
    api
      .get<PontoVendaCategoriaPerp[]>(
        `/api/perpetuos/${id}/vendas-por-dia`,
        paramsPeriodo(inicio, fim),
      )
      .then((r) => r.data),

  investimentoPorDia: (id: string, inicio?: string, fim?: string) =>
    api
      .get<PontoInvestimentoDia[]>(
        `/api/perpetuos/${id}/investimento-por-dia`,
        paramsPeriodo(inicio, fim),
      )
      .then((r) => r.data),

  vendasDoDia: (id: string, dia: string) =>
    api
      .get<OfertaDoDiaPerp[]>(`/api/perpetuos/${id}/vendas-do-dia`, {
        params: { dia },
      })
      .then((r) => r.data),

  // Aportes
  adicionarAporte: (perpetuoId: string, dados: NovoAportePayload) =>
    api
      .post<PerpetuoAporte>(`/api/perpetuos/${perpetuoId}/aportes`, dados)
      .then((r) => r.data),

  removerAporte: (aporteId: string) =>
    api.delete(`/api/perpetuos/aportes/${aporteId}`).then(() => undefined),

  // Manda todas as vendas do perpétuo pra planilha (upsert — não duplica)
  reenviarPlanilha: (perpetuoId: string) =>
    api
      .post<{ enviadas: number }>(`/api/perpetuos/${perpetuoId}/planilha/reenviar`)
      .then((r) => r.data),

  // Sincroniza com Meta Ads (puxa gasto das campanhas filtradas e
  // faz UPSERT em aportes). Retorna sumário com dias/total/período.
  sincronizarMeta: (perpetuoId: string, dias = 3) =>
    api
      .post<{
        dias: number
        total: number | string
        periodo: [string, string] | null
      }>(`/api/perpetuos/${perpetuoId}/sync-meta`, null, {
        params: { dias },
      })
      .then((r) => r.data),

  // VSLs (VTurb)
  vturbPlayersDisponiveis: () =>
    api
      .get<VturbPlayerDisponivel[]>('/api/perpetuos/_meta/vturb-players')
      .then((r) => r.data),

  adicionarVturbPlayer: (perpetuoId: string, dados: NovoVturbPlayerPayload) =>
    api
      .post<VturbPlayerVinculo>(`/api/perpetuos/${perpetuoId}/vturb-players`, dados)
      .then((r) => r.data),

  atualizarVturbPlayer: (vinculoId: string, categoria: CategoriaVsl) =>
    api
      .patch<VturbPlayerVinculo>(`/api/perpetuos/vturb-players/${vinculoId}`, { categoria })
      .then((r) => r.data),

  removerVturbPlayer: (vinculoId: string) =>
    api.delete(`/api/perpetuos/vturb-players/${vinculoId}`).then(() => undefined),

  /** Painel da categoria (sem categoria = a 1ª que tiver VSL vinculada). */
  painelVsl: (perpetuoId: string, categoria?: CategoriaVsl, inicio?: string, fim?: string) => {
    const { params } = paramsPeriodo(inicio, fim)
    if (categoria) params.categoria = categoria
    return api
      .get<VslPainel>(`/api/perpetuos/${perpetuoId}/vsl`, { params })
      .then((r) => r.data)
  },

  /** Análise rápida das VSLs: últimos 7 e 30 dias (independe do filtro). */
  analiseVsl: (perpetuoId: string) =>
    api.get<VslAnalise>(`/api/perpetuos/${perpetuoId}/vsl/analise`).then((r) => r.data),

  curvaVsl: (perpetuoId: string, playerId: string, inicio?: string, fim?: string) =>
    api
      .get<VslCurva>(
        `/api/perpetuos/${perpetuoId}/vsl/${playerId}/curva`,
        paramsPeriodo(inicio, fim),
      )
      .then((r) => r.data),
}
