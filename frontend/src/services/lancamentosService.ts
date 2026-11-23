import { api } from './api'
import type {
  Lancamento,
  LancamentoVendasPainel,
  LeadsPorUtmContent,
  NovoLancamentoPayload,
  Pasta,
  PontoVelocidade,
  SendflowLeads,
  StatusLancamento,
  VinculoOferta,
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
  meta_contas_extras?: { ad_account_id: string; filtro_nome: string | null }[] | null
  sendflow_release_id?: string | null
  /** null tira o lançamento da pasta. */
  pasta_id?: string | null
  investimento_manual?: number | null
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

  sendflowLeads: (id: string) =>
    api
      .get<SendflowLeads>(`/api/lancamentos/${id}/sendflow-leads`)
      .then((r) => r.data),

  debugSendflow: (id: string) =>
    api
      .get<Record<string, unknown>>(`/api/lancamentos/${id}/sendflow-debug`)
      .then((r) => r.data),

  // Dashboard de vendas
  painelVendas: (id: string) =>
    api
      .get<LancamentoVendasPainel>(`/api/lancamentos/${id}/vendas`)
      .then((r) => r.data),

  /** Troca a seleção inteira de ofertas/produtos e devolve o painel recalculado. */
  definirOfertas: (id: string, itens: VinculoOferta[]) =>
    api
      .put<LancamentoVendasPainel>(`/api/lancamentos/${id}/ofertas`, itens)
      .then((r) => r.data),
}

export const pastasService = {
  listar: () => api.get<Pasta[]>('/api/pastas').then((r) => r.data),

  criar: (nome: string) =>
    api.post<Pasta>('/api/pastas', { nome }).then((r) => r.data),

  renomear: (id: string, nome: string) =>
    api.patch<Pasta>(`/api/pastas/${id}`, { nome }).then((r) => r.data),

  /** Apaga só a pasta — os dashboards de dentro continuam, soltos. */
  remover: (id: string) => api.delete(`/api/pastas/${id}`).then(() => undefined),
}
