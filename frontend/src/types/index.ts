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

export interface MetaContaExtra {
  ad_account_id: string
  filtro_nome: string | null
}

/** 'leads' = dashboard de captação. 'vendas' = dashboard de vendas. */
export type TipoLancamento = 'leads' | 'vendas'

/** Pasta que junta os dashboards do mesmo lançamento (leads + vendas). */
export interface Pasta {
  id: string
  nome: string
  criado_em: string
}

export interface Lancamento {
  id: string
  nome: string
  tipo: TipoLancamento
  pasta_id: string | null
  /** Investimento digitado à mão — só vale no dashboard de vendas. */
  investimento_manual: number
  status: StatusLancamento
  data_inicio: string | null
  data_fim: string | null
  meta_leads: number | null
  teto_investimento: number | null
  meta_roas: number | null
  meta_receita: number | null
  meta_ad_account_id: string | null
  meta_filtro_nome: string | null
  meta_contas_extras: MetaContaExtra[] | null
  sendflow_release_id: string | null
  webhook_token: string
  criado_em: string
  total_leads: number
  investimento_total: number
  receita_total: number
  cpl: number
  roas: number
  /** Só no dashboard de vendas (no de leads vem 0). */
  total_vendas: number
  ticket_medio: number
  canais: Canal[]
}

/** Item da seleção do dashboard de vendas. Sem `oferta_codigo` = produto
 * inteiro (todas as ofertas dele, inclusive as futuras). */
export interface VinculoOferta {
  produto: string | null
  oferta_codigo: string | null
  oferta_nome: string | null
}

export interface VinculoOfertaSalvo extends VinculoOferta {
  id: string
}

export interface OfertaVendida {
  produto: string
  oferta_codigo: string | null
  oferta_nome: string | null
  quantidade: number
  receita: number
}

/** Um produto do lançamento, com o subtotal e as ofertas dele. */
export interface ProdutoVendido {
  produto: string
  /** true = o produto foi marcado por inteiro (não oferta por oferta). */
  inteiro: boolean
  quantidade: number
  receita: number
  ofertas: OfertaVendida[]
}

export interface PontoVendaDia {
  dia: string
  quantidade: number
  receita: number
}

export interface LancamentoVendasPainel {
  lancamento: Lancamento
  vinculos: VinculoOfertaSalvo[]
  produtos: ProdutoVendido[]
  por_dia: PontoVendaDia[]
}

export interface SendflowLeads {
  total: number
  grupos_count: number
  release_id: string
}

export interface NovoLancamentoPayload {
  nome: string
  tipo?: TipoLancamento
  pasta_id?: string | null
  investimento_manual?: number | null
  data_inicio?: string | null
  data_fim?: string | null
  meta_leads?: number | null
  teto_investimento?: number | null
}

export interface LeadsPorUtmContent {
  utm_content: string
  quantidade: number
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
  forcar_no_dash: boolean
}

export interface VendaDuplicada {
  id: string
  data_venda: string
  produto: string
  oferta_nome: string | null
  oferta_codigo: string | null
  valor: number
  status: StatusVenda
  plataforma: Plataforma
  comprador_email: string | null
  comprador_nome: string | null
  forcar_no_dash: boolean
}

export interface DuplicadasPaginado {
  items: VendaDuplicada[]
  total: number
  page: number
  size: number
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
  | 'upsell_ingresso'
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
  investimento: number
  meta_ad_account_id: string | null
  meta_filtro_nome: string | null
  meta_receita: number | null
  teto_investimento: number | null
  meta_ingresso_qtd: number | null
  meta_principal_qtd: number | null
}

export interface PontoVendaCategoria {
  dia: string // YYYY-MM-DD
  categoria: CategoriaLancPago
  quantidade: number
  receita: number
}

export interface OfertaDoDia {
  produto: string
  oferta_nome: string | null
  oferta_codigo: string | null
  categoria: CategoriaLancPago
  quantidade: number
  receita: number
}

// ============================================================
// Perpétuos
// ============================================================
export type CategoriaPerpetuo =
  | 'Principal'
  | 'Order Bump'
  | 'Upsell'
  | 'UpUpsell'
  | 'Downsell'
  | 'Downsell 2'
  | 'Outros'

export interface Perpetuo {
  id: string
  nome: string
  data_inicio: string // YYYY-MM-DD
  investimento: number
  meta_ad_account_id: string | null
  meta_filtro_nome: string | null
  meta_contas_extras: MetaContaExtra[] | null
  /** Web App do Apps Script. Preenchida = vendas caem na planilha em tempo real. */
  planilha_url: string | null
}

export interface PerpetuoOfertaDetalhe {
  id: string
  oferta_codigo: string
  oferta_nome: string | null
  /** Nome do produto da oferta (vem da tabela de vendas). */
  produto: string | null
  categoria: CategoriaPerpetuo
  /** Funil que liga ofertas (ex.: "Funil Especial") — a tela agrupa por ele. */
  funil: string | null
  /** Explicação livre mostrada no "?" do card. */
  descricao: string | null
  /** Não roda mais: some da tela, mas continua somando nos totais. */
  oculta: boolean
  quantidade: number
  /** Receita pelo preço da oferta (cards e gráficos). */
  receita: number
  /** O que a Hotmart repassa (já sem taxa da Hotmart e afiliado). */
  faturamento_liquido: number
  /** O que o cliente pagou (com juros do parcelamento). */
  faturamento_bruto: number
  /** Preço pago pela oferta, sem juros. */
  valor_vendas: number
}

/** Vendas de uma etapa do funil (Front, Upsell 1, Downsell 2...). */
export interface ResumoEtapaPerpetuo {
  categoria: CategoriaPerpetuo
  quantidade: number
  /** Faturamento líquido da etapa. */
  valor: number
}

/** Blocos do topo do perpétuo — calculados no backend
 * (perpetuo_resumo_service). */
export interface ResumoPerpetuo {
  faturamento_liquido: number
  faturamento_bruto: number
  /** Informativo: já descontadas do líquido, não entram no custo. */
  taxas_hotmart: number
  custo_anuncios: number
  taxa_meta: number
  taxa_empresa: number
  impostos_totais: number
  custo_total: number
  resultado: number
  roas: number | null
  cpa: number | null
  ticket_medio: number | null
  vendas_front: number
  vendas_total: number
  pct_taxa_meta: number
  pct_taxa_empresa: number
  por_categoria: ResumoEtapaPerpetuo[]
}

/** Categoria da oferta cadastrada: se null, o backend deriva pelo nome
 * (heurística). Se setada, sobrescreve. */
export type CategoriaPerpetuoOpcional = CategoriaPerpetuo | null

export interface PerpetuoAporte {
  id: string
  dia: string // YYYY-MM-DD
  valor: number
  descricao: string | null
}

export interface PerpetuoCompleto {
  perpetuo: Perpetuo
  inicio: string
  fim: string
  ofertas: PerpetuoOfertaDetalhe[]
  aportes: PerpetuoAporte[]
  investimento_total: number
  receita_total: number
  quantidade_total: number
  /** Blocos do topo (respeitam o filtro de categorias). */
  resumo: ResumoPerpetuo | null
}

export interface PontoVendaCategoriaPerp {
  dia: string
  categoria: CategoriaPerpetuo
  quantidade: number
  receita: number
}

export interface OfertaDoDiaPerp {
  produto: string
  oferta_nome: string | null
  oferta_codigo: string | null
  categoria: CategoriaPerpetuo
  quantidade: number
  receita: number
}

export interface PontoInvestimentoDia {
  dia: string
  valor: number
}

export interface OfertaDisponivel {
  oferta_codigo: string
  oferta_nome: string | null
  produto: string | null
}

// ============================================================
// VSLs (VTurb) dos perpétuos
// ============================================================
/** Mesma categoria das ofertas — é ela que cruza a VSL com as vendas reais. */
export type CategoriaVsl = 'Principal' | 'Upsell' | 'UpUpsell' | 'Downsell'

export interface VturbPlayerVinculo {
  id: string
  player_id: string
  player_nome: string | null
  categoria: CategoriaVsl
}

export interface VturbPlayerDisponivel {
  player_id: string
  nome: string
  duracao_seg: number | null
  /** Segundo do pitch cadastrado na VTurb (null = não cadastrado). */
  pitch_seg: number | null
  plays_30d: number
  criado_em: string | null
}

/** Taxas em porcentagem (0–100); null quando o denominador é zero. */
export interface VslKpis {
  views: number
  views_unicas: number
  plays: number
  plays_unicos: number
  play_rate: number | null
  engajamento: number | null
  tempo_medio_seg: number | null
  finalizacoes: number
  finalizacoes_unicas: number
  taxa_finalizacao: number | null
  cliques: number
  cliques_unicos: number
  taxa_clique: number | null
  audiencia_pitch: number | null
  retencao_pitch: number | null
  /** Atribuição por pixel da VTurb — só referência, não é venda. */
  conversoes_vturb: number
  receita_vturb: number
  conversao_vturb: number | null
  // Vendas reais da categoria (só no total da categoria)
  vendas_reais: number | null
  receita_real: number | null
  conversao_real: number | null
  receita_por_play: number | null
  // Só na categoria Principal
  investimento: number | null
  custo_por_play: number | null
  custo_por_view: number | null
}

export interface VslPontoDia {
  dia: string
  views: number
  views_unicas: number
  plays: number
  plays_unicos: number
  play_rate: number | null
  engajamento: number | null
  finalizacoes_unicas: number
  cliques_unicos: number
  taxa_clique: number | null
  conversoes_vturb: number
}

export interface VslLinhaPlayer {
  vinculo_id: string
  player_id: string
  nome: string
  categoria: CategoriaVsl
  duracao_seg: number | null
  pitch_seg: number | null
  kpis: VslKpis
}

export interface VslPainel {
  /** false = falta a chave da VTurb no backend. */
  configurado: boolean
  inicio: string
  fim: string
  categoria: CategoriaVsl | null
  categorias_disponiveis: CategoriaVsl[]
  vinculos: VturbPlayerVinculo[]
  kpis: VslKpis | null
  dias: VslPontoDia[]
  players: VslLinhaPlayer[]
}

export interface VslCurvaPonto {
  segundo: number
  retencao: number | null
  usuarios: number | null
  cliques: number
  conversoes: number
}

export interface VslCurva {
  player_id: string
  nome: string
  duracao_seg: number | null
  pitch_seg: number | null
  tempo_medio_seg: number | null
  engajamento: number | null
  pontos: VslCurvaPonto[]
}

/** Uma VSL na análise rápida (taxas em %, null = sem dado). */
export interface VslAnaliseLinha {
  player_id: string
  nome: string
  categoria: CategoriaVsl
  plays_unicos: number
  retencao_1min: number | null
  retencao_5min: number | null
  retencao_pitch: number | null
  /** Conversões do pixel VTurb ÷ plays únicos — atribuição, não é venda. */
  conversao_vturb: number | null
  play_rate: number | null
  /** Vendas que o pixel da VTurb atribuiu à VSL — atribuição, não é a venda real. */
  conversoes_vturb: number
  /** 1º dia de tráfego de verdade (ignora plays de teste antes do lançamento). */
  no_ar_desde: string | null
  /** Dias de no_ar_desde até hoje, contando os dois (lançou hoje = 1). */
  dias_no_ar: number | null
}

export interface VslAnaliseJanela {
  dias: number
  inicio: string
  fim: string
  linhas: VslAnaliseLinha[]
}

export interface VslAnalise {
  configurado: boolean
  janelas: VslAnaliseJanela[]
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

// ============================================================
// Luzi — assistente de IA de vendas
// ============================================================
export type PapelMensagemLuzi = 'usuario' | 'luzi'

export interface MensagemLuzi {
  papel: PapelMensagemLuzi
  conteudo: string
}

export interface LuziConfig {
  /** Ids (minúsculos) dos perpétuos com a Luzi habilitada. */
  perpetuos_habilitados: string[]
}
