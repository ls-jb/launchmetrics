import { api } from './api'
import type {
  PlacarCompleto,
  PlacarLancamento,
  PlacarOferta,
  PlacarVendedor,
} from '@/types'

export interface OfertaPayload {
  produto: string
  oferta?: string | null
  valor: number
}

interface MarcacaoResponse {
  vendedor_id: string
  oferta_id: string
  quantidade: number
}

export const placarService = {
  // leitura / marcação (qualquer logado)
  listarLancamentos: () =>
    api.get<PlacarLancamento[]>('/api/placar/lancamentos').then((r) => r.data),

  obter: (lancamentoId: string) =>
    api
      .get<PlacarCompleto>(`/api/placar/lancamentos/${lancamentoId}`)
      .then((r) => r.data),

  marcar: (vendedor_id: string, oferta_id: string, delta: 1 | -1) =>
    api
      .post<MarcacaoResponse>('/api/placar/marcar', { vendedor_id, oferta_id, delta })
      .then((r) => r.data),

  // cadastro (admin)
  criarLancamento: (nome: string) =>
    api
      .post<PlacarLancamento>('/api/placar/lancamentos', { nome })
      .then((r) => r.data),

  atualizarLancamento: (id: string, dados: { nome?: string; ativo?: boolean }) =>
    api
      .patch<PlacarLancamento>(`/api/placar/lancamentos/${id}`, dados)
      .then((r) => r.data),

  removerLancamento: (id: string) =>
    api.delete(`/api/placar/lancamentos/${id}`).then(() => undefined),

  adicionarOferta: (lancamentoId: string, dados: OfertaPayload) =>
    api
      .post<PlacarOferta>(`/api/placar/lancamentos/${lancamentoId}/ofertas`, dados)
      .then((r) => r.data),

  removerOferta: (ofertaId: string) =>
    api.delete(`/api/placar/ofertas/${ofertaId}`).then(() => undefined),

  adicionarVendedor: (lancamentoId: string, nome: string) =>
    api
      .post<PlacarVendedor>(`/api/placar/lancamentos/${lancamentoId}/vendedores`, {
        nome,
      })
      .then((r) => r.data),

  removerVendedor: (vendedorId: string) =>
    api.delete(`/api/placar/vendedores/${vendedorId}`).then(() => undefined),
}
