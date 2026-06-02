export const cores = {
  fundo: 'var(--bg)',
  card: 'var(--surface)',
  borda: 'var(--border)',
  bordaHover: 'var(--border-strong)',
  primaria: '#7C6AF7',
  sucesso: '#3ECFB2',
  atencao: '#F59E0B',
  erro: '#EF4444',
  textoPrimario: 'var(--text)',
  textoSecundario: 'var(--text-faint)',
  textoMudo: 'var(--text-dim)',
} as const

export const formatBRL = (valor: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(valor)

export const formatBRLPreciso = (valor: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(valor)

export const formatNum = (valor: number) =>
  new Intl.NumberFormat('pt-BR').format(valor)

export const formatPct = (valor: number, meta: number) =>
  meta > 0 ? Math.min(Math.round((valor / meta) * 100), 100) : 0
