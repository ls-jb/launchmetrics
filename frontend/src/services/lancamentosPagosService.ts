import { api } from './api'
import type {
  CategoriaLancPago,
  LancamentoPago,
  LancamentoPagoAjuste,
  LancamentoPagoCompleto,
  LancamentoPagoOferta,
} from '@/types'

export interface NovoLancamentoPayload {
  nome: string
  ingresso_inicio: string // YYYY-MM-DD
  ingresso_fim: string
  principal_inicio: string
  principal_fim: string
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

  atualizar: (id: string, dados: Partial<NovoLancamentoPayload>) =>
    api
      .patch<LancamentoPago>(`/api/lancamentos-pagos/${id}`, dados)
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
}
