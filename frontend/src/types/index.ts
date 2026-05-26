export type StatusLancamento =
  | 'pre_lancamento'
  | 'captacao'
  | 'carrinho'
  | 'encerrado'

export interface Canal {
  id: string
  nome: string
  leads: number
  investimento: number
}

export interface Lancamento {
  id: string
  nome: string
  status: StatusLancamento
  data_inicio: string | null
  data_fim: string | null
  meta_leads: number | null
  meta_roas: number | null
  meta_receita: number | null
  webhook_token: string
  criado_em: string
  total_leads: number
  investimento_total: number
  receita_total: number
  cpl: number
  roas: number
  canais: Canal[]
}

export interface PontoVelocidade {
  dia: string
  leads: number
}

export interface Venda {
  id: string
  plataforma: 'Hotmart' | 'PagMe' | 'PagTrust'
  produto: string
  oferta: 'Principal' | 'Order Bump' | 'Upsell' | 'Downsell'
  valor: number
  status: 'aprovada' | 'pendente' | 'cancelada'
  comprador_nome: string
  comprador_email: string
  data_venda: string
}

export interface ResumoVendas {
  receita_total: number
  quantidade: number
  ticket_medio: number
}

export interface PontoReceita {
  data: string
  receita: number
}

export interface ProdutoRanking {
  produto: string
  quantidade: number
  receita: number
}
