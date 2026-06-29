import { api } from './api'
import type {
  Lancamento,
  LeadsPorUtmContent,
  NovoLancamentoPayload,
  PontoVelocidade,
  StatusLancamento,
} from '@/types'

export type LancamentoCreatePayload = NovoLancamentoPayload

export interface LancamentoUpdatePayload {
  nome?: string
  status?: StatusLancamento
  data_inicio?: string | null
  data_fim?: string | null
  meta_leads?: number | null
  teto_investimento?: number | null
  meta_roas?: number | null
  meta_receita?: number | null
  meta_ad_account_id?: string | null
  meta_filtro_nome?: string | null
}

export interface SyncMetaLancamentoResposta {
  investimento: number
  periodo: [string, string] | null
  atualizado: boolean
}

export interface CanalUpdatePayload {
  id: string
  investimento: number
}

export const lancamentosService = {
  listar: () =>
    api.get<Lancamento[]>('/api/lancamentos').then((r) => r.data),

  obter: (id: string) =>
    api.get<Lancamento>(`/api/lancamentos/${id}`).then((r) => r.data),

  criar: (dados: LancamentoCreatePayload) =>
    api.post<Lancamento>('/api/lancamentos', dados).then((r) => r.data),

  atualizar: (id: string, dados: LancamentoUpdatePayload) =>
    api.patch<Lancamento>(`/api/lancamentos/${id}`, dados).then((r) => r.data),

  deletar: (id: string) =>
    api.delete(`/api/lancamentos/${id}`).then(() => undefined),

  atualizarCanais: (id: string, canais: CanalUpdatePayload[]) =>
    api
      .patch<Lancamento>(`/api/lancamentos/${id}/canais`, canais)
      .then((r) => r.data),

  velocidadeLeads: (id: string) =>
    api
      .get<PontoVelocidade[]>(`/api/lancamentos/${id}/velocidade-leads`)
      .then((r) => r.data),

  leadsPorUtmContent: (id: string, canalId: string) =>
    api
      .get<LeadsPorUtmContent[]>(
        `/api/lancamentos/${id}/canais/${canalId}/utm-content`,
      )
      .then((r) => r.data),

  sincronizarMeta: (id: string) =>
    api
      .post<SyncMetaLancamentoResposta>(`/api/lancamentos/${id}/sync-meta`)
      .then((r) => r.data),

  debugMeta: (id: string) =>
    api
      .get<Record<string, unknown>>(`/api/lancamentos/${id}/sync-meta-debug`)
      .then((r) => r.data),
}
