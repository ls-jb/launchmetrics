import type {
  Lancamento,
  PontoVelocidade,
  Venda,
  ResumoVendas,
  PontoReceita,
  ProdutoRanking,
} from '@/types'

export const lancamentosMock: Lancamento[] = [
  {
    id: 'lcm-001',
    nome: 'Método Acelerado — Edição Maio',
    status: 'captacao',
    data_inicio: '2026-05-05',
    data_fim: '2026-05-26',
    meta_leads: 8000,
    meta_roas: 4.5,
    meta_receita: 480000,
    webhook_token: 'a7f3c91e8d4b2f06',
    criado_em: '2026-04-22T13:21:00Z',
    total_leads: 5620,
    investimento_total: 42800,
    receita_total: 198400,
    cpl: 7.62,
    roas: 4.63,
    canais: [
      { id: 'c1', nome: 'Meta Ads', leads: 3120, investimento: 26400 },
      { id: 'c2', nome: 'Google Ads', leads: 1280, investimento: 11200 },
      { id: 'c3', nome: 'Orgânico', leads: 980, investimento: 0 },
      { id: 'c4', nome: 'Email', leads: 240, investimento: 5200 },
    ],
  },
  {
    id: 'lcm-002',
    nome: 'Workshop Estratégia de Vendas',
    status: 'pre_lancamento',
    data_inicio: '2026-06-10',
    data_fim: '2026-06-30',
    meta_leads: 3500,
    meta_roas: 3.8,
    meta_receita: 180000,
    webhook_token: 'b8c4d29f7e1a3b50',
    criado_em: '2026-05-18T09:00:00Z',
    total_leads: 420,
    investimento_total: 3800,
    receita_total: 0,
    cpl: 9.05,
    roas: 0,
    canais: [
      { id: 'c5', nome: 'Meta Ads', leads: 280, investimento: 3200 },
      { id: 'c6', nome: 'Orgânico', leads: 140, investimento: 0 },
      { id: 'c7', nome: 'WhatsApp', leads: 0, investimento: 600 },
    ],
  },
  {
    id: 'lcm-003',
    nome: 'Bootcamp Tráfego Pago — Abril',
    status: 'encerrado',
    data_inicio: '2026-04-01',
    data_fim: '2026-04-22',
    meta_leads: 6000,
    meta_roas: 4.0,
    meta_receita: 320000,
    webhook_token: 'f2e8a91d6c5b4a30',
    criado_em: '2026-03-15T10:00:00Z',
    total_leads: 7180,
    investimento_total: 78400,
    receita_total: 341600,
    cpl: 10.92,
    roas: 4.36,
    canais: [
      { id: 'c8', nome: 'Meta Ads', leads: 4200, investimento: 52000 },
      { id: 'c9', nome: 'Google Ads', leads: 1900, investimento: 22000 },
      { id: 'c10', nome: 'Orgânico', leads: 880, investimento: 0 },
      { id: 'c11', nome: 'Email', leads: 200, investimento: 4400 },
    ],
  },
]

export const velocidadeLeadsMock: PontoVelocidade[] = [
  { dia: '05/05', leads: 180 },
  { dia: '06/05', leads: 240 },
  { dia: '07/05', leads: 310 },
  { dia: '08/05', leads: 280 },
  { dia: '09/05', leads: 360 },
  { dia: '10/05', leads: 410 },
  { dia: '11/05', leads: 480 },
  { dia: '12/05', leads: 520 },
  { dia: '13/05', leads: 470 },
  { dia: '14/05', leads: 540 },
  { dia: '15/05', leads: 610 },
  { dia: '16/05', leads: 680 },
  { dia: '17/05', leads: 540 },
  { dia: '18/05', leads: 0 },
]

const PRODUTOS = [
  'Método Acelerado',
  'Bootcamp Tráfego Pago',
  'Workshop Vendas',
  'Mentoria Premium',
]

const OFERTAS: Venda['oferta'][] = ['Principal', 'Order Bump', 'Upsell', 'Downsell']
const PLATAFORMAS: Venda['plataforma'][] = ['Hotmart', 'PagMe', 'PagTrust']

function gerarVendas(): Venda[] {
  const vendas: Venda[] = []
  const hoje = new Date('2026-05-25')
  for (let i = 0; i < 220; i++) {
    const diasAtras = Math.floor(Math.random() * 30)
    const data = new Date(hoje)
    data.setDate(data.getDate() - diasAtras)
    const oferta = OFERTAS[Math.floor(Math.random() * OFERTAS.length)]
    const produto = PRODUTOS[Math.floor(Math.random() * PRODUTOS.length)]
    const valorBase: Record<Venda['oferta'], number> = {
      Principal: 997,
      'Order Bump': 47,
      Upsell: 297,
      Downsell: 97,
    }
    vendas.push({
      id: `v-${i.toString().padStart(4, '0')}`,
      plataforma: PLATAFORMAS[Math.floor(Math.random() * PLATAFORMAS.length)],
      produto,
      oferta,
      valor: valorBase[oferta] + Math.floor(Math.random() * 50),
      status: 'aprovada',
      comprador_nome: `Cliente ${i + 1}`,
      comprador_email: `cliente${i + 1}@email.com`,
      data_venda: data.toISOString(),
    })
  }
  return vendas
}

export const vendasMock: Venda[] = gerarVendas()

export function filtrarVendas(
  inicio: string,
  fim: string,
  produto: string | null,
  oferta: string | null,
): Venda[] {
  const dInicio = new Date(inicio + 'T00:00:00Z').getTime()
  const dFim = new Date(fim + 'T23:59:59Z').getTime()
  return vendasMock.filter((v) => {
    const ts = new Date(v.data_venda).getTime()
    if (ts < dInicio || ts > dFim) return false
    if (produto && v.produto !== produto) return false
    if (oferta && v.oferta !== oferta) return false
    return true
  })
}

export function calcularResumo(vendas: Venda[]): ResumoVendas {
  const receita_total = vendas.reduce((acc, v) => acc + v.valor, 0)
  const quantidade = vendas.length
  return {
    receita_total,
    quantidade,
    ticket_medio: quantidade > 0 ? receita_total / quantidade : 0,
  }
}

export function receitaPorDia(vendas: Venda[]): PontoReceita[] {
  const mapa = new Map<string, number>()
  vendas.forEach((v) => {
    const dia = v.data_venda.slice(0, 10)
    mapa.set(dia, (mapa.get(dia) ?? 0) + v.valor)
  })
  return Array.from(mapa.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([data, receita]) => ({
      data: data.slice(8, 10) + '/' + data.slice(5, 7),
      receita,
    }))
}

export function rankingPorProduto(vendas: Venda[]): ProdutoRanking[] {
  const mapa = new Map<string, { quantidade: number; receita: number }>()
  vendas.forEach((v) => {
    const atual = mapa.get(v.produto) ?? { quantidade: 0, receita: 0 }
    atual.quantidade += 1
    atual.receita += v.valor
    mapa.set(v.produto, atual)
  })
  return Array.from(mapa.entries())
    .map(([produto, dados]) => ({ produto, ...dados }))
    .sort((a, b) => b.receita - a.receita)
}

export const produtosUnicos = Array.from(new Set(vendasMock.map((v) => v.produto)))
