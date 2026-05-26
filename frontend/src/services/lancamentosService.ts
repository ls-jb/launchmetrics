import { api } from './api'
import type { Lancamento, PontoVelocidade, StatusLancamento } from '@/types'

export interface LancamentoCreatePayload {
  nome: string
  status?: StatusLancamento
  data_inicio?: string | null
  data_fim?: string | null
  meta_leads?: number | null
  meta_roas?: number | null
  meta_receita?: number | null
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

  atualizar: (id: string, dados: Partial<LancamentoCreatePayload>) =>
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
}
