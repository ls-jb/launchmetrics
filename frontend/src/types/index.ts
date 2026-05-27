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

export type Plataforma = 'Hotmart' | 'Guru' | 'PagMe' | 'PagTrust' | 'Manual'
export type Oferta = 'Principal' | 'Order Bump' | 'Upsell' | 'Downsell'
export type StatusVenda = 'aprovada' | 'pendente' | 'cancelada' | 'reembolsada'
export type TipoVenda = 'unica' | 'recorrencia'
export type MetodoPagamento =
  | 'cartao'
  | 'boleto'
  | 'pix'
  | 'transferencia'
  | 'cartao_2x'
  | 'outro'

export interface Venda {
  id: string
  plataforma: Plataforma
  external_id: string | null
  produto: string
  oferta: Oferta | null
  tipo: TipoVenda
  recorrencia_seq: number | null
  assinatura_id: string | null
  metodo_pagamento: MetodoPagamento | null
  valor: number
  status: StatusVenda
  comprador_nome: string | null
  comprador_email: string | null
  data_venda: string
  criado_em: string
}

export interface VendaManualCreatePayload {
  produto: string
  valor: number
  metodo_pagamento: MetodoPagamento
  data_venda: string
  comprador_nome?: string | null
  comprador_email?: string | null
  oferta?: Oferta | null
  tipo?: TipoVenda
  recorrencia_seq?: number | null
  assinatura_id?: string | null
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
