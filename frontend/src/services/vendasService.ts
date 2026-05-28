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
  produto?: string | null
  oferta?: string | null
}

function paramsDe(f: FiltroVendas): { params: Record<string, string> } {
  const p: Record<string, string> = { inicio: f.inicio, fim: f.fim }
  if (f.produto) p.produto = f.produto
  if (f.oferta) p.oferta = f.oferta
  return { params: p }
}

export const vendasService = {
  listar: (f: FiltroVendas) =>
    api.get<Venda[]>('/api/vendas', paramsDe(f)).then((r) => r.data),

  criarManual: (dados: VendaManualCreatePayload) =>
    api.post<Venda>('/api/vendas', dados).then((r) => r.data),

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
}
