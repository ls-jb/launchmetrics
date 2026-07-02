import { api } from './api'
import type {
  CategoriaLancPago,
  LancamentoPago,
  LancamentoPagoAjuste,
  LancamentoPagoCompleto,
  LancamentoPagoOferta,
  PontoVendaCategoria,
} from '@/types'

export interface NovoLancamentoPayload {
  nome: string
  ingresso_inicio: string // YYYY-MM-DD
  ingresso_fim: string
  principal_inicio: string
  principal_fim: string
}

export interface AtualizarLancamentoPayload {
  nome?: string
  ingresso_inicio?: string
  ingresso_fim?: string
  principal_inicio?: string
  principal_fim?: string
  investimento?: number | null
  meta_ad_account_id?: string | null
  meta_filtro_nome?: string | null
  meta_receita?: number | null
  teto_investimento?: number | null
  meta_ingresso_qtd?: number | null
  meta_principal_qtd?: number | null
}

export interface NovaOfertaPayload {
  produto: string
  oferta_nome?: string | null
  oferta_codigo?: string | null
  categoria: CategoriaLancPago
}

export interface NovoAjustePayload {
  quantidade: number
  valor: number
  descricao?: string | null
}

export const lancamentosPagosService = {
  listar: () =>
    api.get<LancamentoPago[]>('/api/lancamentos-pagos').then((r) => r.data),

  obter: (id: string) =>
    api
      .get<LancamentoPagoCompleto>(`/api/lancamentos-pagos/${id}`)
      .then((r) => r.data),

  criar: (dados: NovoLancamentoPayload) =>
    api
      .post<LancamentoPago>('/api/lancamentos-pagos', dados)
      .then((r) => r.data),

  atualizar: (id: string, dados: AtualizarLancamentoPayload) =>
    api
      .patch<LancamentoPago>(`/api/lancamentos-pagos/${id}`, dados)
      .then((r) => r.data),

  vendasPorDia: (id: string) =>
    api
      .get<PontoVendaCategoria[]>(
        `/api/lancamentos-pagos/${id}/vendas-por-dia`,
      )
      .then((r) => r.data),

  remover: (id: string) =>
    api.delete(`/api/lancamentos-pagos/${id}`).then(() => undefined),

  adicionarOferta: (lancamentoId: string, dados: NovaOfertaPayload) =>
    api
      .post<LancamentoPagoOferta>(
        `/api/lancamentos-pagos/${lancamentoId}/ofertas`,
        dados,
      )
      .then((r) => r.data),

  removerOferta: (ofertaId: string) =>
    api
      .delete(`/api/lancamentos-pagos/ofertas/${ofertaId}`)
      .then(() => undefined),

  adicionarAjuste: (ofertaId: string, dados: NovoAjustePayload) =>
    api
      .post<LancamentoPagoAjuste>(
        `/api/lancamentos-pagos/ofertas/${ofertaId}/ajustes`,
        dados,
      )
      .then((r) => r.data),

  removerAjuste: (ajusteId: string) =>
    api
      .delete(`/api/lancamentos-pagos/ajustes/${ajusteId}`)
      .then(() => undefined),

  // Puxa gasto Meta Ads no período do lançamento e sobrescreve o campo
  // investimento. Janela: [ingresso_inicio, principal_fim].
  sincronizarMeta: (lancamentoId: string) =>
    api
      .post<{
        investimento: number | string
        periodo: [string, string] | null
        atualizado: boolean
      }>(`/api/lancamentos-pagos/${lancamentoId}/sync-meta`)
      .then((r) => r.data),

  // Gasto Meta Ads por dia (on-demand). Vazio se sem Meta configurada.
  investimentoPorDia: (lancamentoId: string) =>
    api
      .get<{ dia: string; valor: number }[]>(
        `/api/lancamentos-pagos/${lancamentoId}/investimento-por-dia`,
      )
      .then((r) => r.data),
}
