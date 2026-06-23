import { api } from './api'
import type {
  OfertaBreakdown,
  PontoReceita,
  ProdutoRanking,
  ResumoVendas,
  Venda,
  VendaManualCreatePayload,
} from '@/types'

export interface FiltroVendas {
  inicio: string // YYYY-MM-DD
  fim: string // YYYY-MM-DD
  produtos?: string[]
  oferta?: string | null
  plataforma?: string | null
  limit?: number
}

function paramsDe(f: FiltroVendas) {
  const params: Record<string, string | string[] | number> = {
    inicio: f.inicio,
    fim: f.fim,
  }
  if (f.produtos && f.produtos.length > 0) params.produtos = f.produtos
  if (f.oferta) params.oferta = f.oferta
  if (f.plataforma) params.plataforma = f.plataforma
  if (f.limit) params.limit = f.limit
  // indexes:null serializa arrays como ?produtos=A&produtos=B (formato que o
  // FastAPI entende como list[str])
  return { params, paramsSerializer: { indexes: null } }
}

export const vendasService = {
  listar: (f: FiltroVendas) =>
    api.get<Venda[]>('/api/vendas', paramsDe(f)).then((r) => r.data),

  criarManual: (dados: VendaManualCreatePayload) =>
    api.post<Venda>('/api/vendas', dados).then((r) => r.data),

  remover: (id: string) =>
    api.delete(`/api/vendas/${id}`).then(() => undefined),

  resumo: (f: FiltroVendas) =>
    api.get<ResumoVendas>('/api/vendas/resumo', paramsDe(f)).then((r) => r.data),

  porDia: (f: FiltroVendas) =>
    api
      .get<PontoReceita[]>('/api/vendas/por-dia', paramsDe(f))
      .then((r) => r.data),

  porProduto: (f: FiltroVendas) =>
    api
      .get<ProdutoRanking[]>('/api/vendas/por-produto', paramsDe(f))
      .then((r) => r.data),

  produtos: () =>
    api.get<string[]>('/api/vendas/produtos').then((r) => r.data),

  ofertasPorProduto: (produto: string, inicio: string, fim: string) =>
    api
      .get<OfertaBreakdown[]>('/api/vendas/ofertas', {
        params: { produto, inicio, fim },
      })
      .then((r) => r.data),

  definirPrecoOferta: (
    oferta_codigo: string,
    oferta_nome: string | null,
    valor: number,
  ) =>
    api
      .put('/api/vendas/ofertas/preco', { oferta_codigo, oferta_nome, valor })
      .then((r) => r.data),
}
