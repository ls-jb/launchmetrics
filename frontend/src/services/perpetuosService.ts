import { api } from './api'
import type {
  OfertaDisponivel,
  Perpetuo,
  PerpetuoAporte,
  PerpetuoCompleto,
  PontoInvestimentoDia,
  PontoVendaCategoriaPerp,
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
}

export interface NovoAportePayload {
  dia: string // YYYY-MM-DD
  valor: number
  descricao?: string | null
}

export interface NovaOfertaPayload {
  oferta_codigo: string
  oferta_nome?: string | null
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

  // Aportes
  adicionarAporte: (perpetuoId: string, dados: NovoAportePayload) =>
    api
      .post<PerpetuoAporte>(`/api/perpetuos/${perpetuoId}/aportes`, dados)
      .then((r) => r.data),

  removerAporte: (aporteId: string) =>
    api.delete(`/api/perpetuos/aportes/${aporteId}`).then(() => undefined),

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
}
