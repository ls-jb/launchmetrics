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

/** Taxa que já vem em porcentagem (0–100) do backend: 52.17 → "52,2%".
 * null/undefined → "—" (backend manda null quando o denominador é zero). */
export const formatTaxa = (valor: number | null | undefined, casas = 1) =>
  valor === null || valor === undefined
    ? '—'
    : `${new Intl.NumberFormat('pt-BR', {
        minimumFractionDigits: casas,
        maximumFractionDigits: casas,
      }).format(valor)}%`

/** Segundos → "8:31" (ou "1:02:03" acima de 1 h). null → "—". */
export const formatDuracao = (segundos: number | null | undefined) => {
  if (segundos === null || segundos === undefined) return '—'
  const total = Math.round(segundos)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}
