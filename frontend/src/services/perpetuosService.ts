import { api } from './api'
import type {
  Perpetuo,
  PerpetuoCompleto,
  PontoVendaProduto,
} from '@/types'

export interface NovoPerpetuoPayload {
  nome: string
  data_inicio: string // YYYY-MM-DD
  investimento?: number | null
  produtos: string[]
}

export interface AtualizarPerpetuoPayload {
  nome?: string
  data_inicio?: string
  investimento?: number | null
}

export const perpetuosService = {
  listar: () =>
    api.get<Perpetuo[]>('/api/perpetuos').then((r) => r.data),

  obter: (id: string) =>
    api.get<PerpetuoCompleto>(`/api/perpetuos/${id}`).then((r) => r.data),

  criar: (dados: NovoPerpetuoPayload) =>
    api.post<Perpetuo>('/api/perpetuos', dados).then((r) => r.data),

  atualizar: (id: string, dados: AtualizarPerpetuoPayload) =>
    api.patch<Perpetuo>(`/api/perpetuos/${id}`, dados).then((r) => r.data),

  remover: (id: string) =>
    api.delete(`/api/perpetuos/${id}`).then(() => undefined),

  adicionarProduto: (perpetuoId: string, produto: string) =>
    api
      .post<{ id: string; produto: string }>(
        `/api/perpetuos/${perpetuoId}/produtos`,
        { produto },
      )
      .then((r) => r.data),

  removerProduto: (produtoId: string) =>
    api
      .delete(`/api/perpetuos/produtos/${produtoId}`)
      .then(() => undefined),

  vendasPorDia: (id: string) =>
    api
      .get<PontoVendaProduto[]>(`/api/perpetuos/${id}/vendas-por-dia`)
      .then((r) => r.data),
}
