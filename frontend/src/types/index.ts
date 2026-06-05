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
  oferta_nome: string | null
  oferta_codigo: string | null
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

export type Papel = 'admin' | 'viewer'

export interface Usuario {
  user_id: string
  email: string
  nome: string | null
  papel: Papel
  criado_em: string
}

export interface MeuPerfil {
  user_id: string
  email: string
  nome: string | null
  papel: Papel
}

export interface VendaManualCreatePayload {
  produto: string
  valor: number
  metodo_pagamento: MetodoPagamento
  data_venda: string
  quantidade?: number
  comprador_nome?: string | null
  comprador_email?: string | null
  oferta?: Oferta | null
  oferta_nome?: string | null
  oferta_codigo?: string | null
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
  quantidade: number
}

export interface ProdutoRanking {
  produto: string
  quantidade: number
  receita: number
}

export interface OfertaBreakdown {
  oferta_nome: string | null
  oferta_codigo: string | null
  valor_oferta: number
  quantidade: number
  receita: number
  valor_override: number | null
}

// ============================================================
// Placar de líderes
// ============================================================
export interface PlacarLancamento {
  id: string
  nome: string
  ativo: boolean
}

export interface PlacarOferta {
  id: string
  produto: string
  oferta: string | null
  oferta_codigo: string | null
  valor: number
}

export interface PlacarVendedor {
  id: string
  nome: string
}

export interface PlacarContagem {
  vendedor_id: string
  oferta_id: string
  quantidade: number
}

export interface PlacarRankingItem {
  vendedor_id: string
  nome: string
  quantidade_total: number
  receita_total: number
}

export interface PlacarTotal {
  quantidade: number
  receita: number
}

export interface PlacarCompleto {
  lancamento: PlacarLancamento
  ofertas: PlacarOferta[]
  vendedores: PlacarVendedor[]
  ranking: PlacarRankingItem[]
  contagens: PlacarContagem[]
  total_real: PlacarTotal
  total_closers: PlacarTotal
}

// ============================================================
// Lançamento Pago
// ============================================================
export type CategoriaLancPago =
  | 'ingresso'
  | 'order_bump_ingresso'
  | 'principal'
  | 'order_bump_principal'
  | 'upsell'
  | 'downsell'

export interface LancamentoPago {
  id: string
  nome: string
  ingresso_inicio: string // YYYY-MM-DD
  ingresso_fim: string
  principal_inicio: string
  principal_fim: string
}

export interface LancamentoPagoOferta {
  id: string
  produto: string
  oferta_nome: string | null
  oferta_codigo: string | null
  categoria: CategoriaLancPago
}

export interface LancamentoPagoAjuste {
  id: string
  quantidade: number
  valor: number
  descricao: string | null
}

export interface LancamentoPagoOfertaDetalhe {
  id: string
  produto: string
  oferta_nome: string | null
  oferta_codigo: string | null
  quantidade: number
  receita: number
  quantidade_manual: number
  receita_manual: number
  ajustes: LancamentoPagoAjuste[]
}

export interface LancamentoPagoTotal {
  categoria: CategoriaLancPago
  quantidade: number
  receita: number
  ofertas: LancamentoPagoOfertaDetalhe[]
}

export interface LancamentoPagoCompleto {
  lancamento: LancamentoPago
  totais_por_categoria: LancamentoPagoTotal[]
}
