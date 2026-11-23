import type { Lancamento, TipoLancamento } from '@/types'

const TIPO_CORES: Record<TipoLancamento, string> = {
  leads: '#7C6AF7',
  vendas: '#3ECFB2',
}

const TIPO_LABELS: Record<TipoLancamento, string> = {
  leads: 'Leads',
  vendas: 'Vendas',
}

/** Endereço da tela de detalhe — cada tipo de dashboard tem a sua. */
export function rotaDoLancamento(l: Pick<Lancamento, 'id' | 'tipo'>): string {
  return l.tipo === 'vendas' ? `/lancamentos/vendas/${l.id}` : `/lancamentos/${l.id}`
}

/** Etiqueta que diz se o dashboard é de Leads ou de Vendas. */
export function EtiquetaTipo({ tipo }: { tipo: TipoLancamento }) {
  const cor = TIPO_CORES[tipo] ?? 'var(--text-faint)'
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 700,
        padding: '3px 10px',
        borderRadius: 6,
        background: cor + '22',
        color: cor,
        border: `1px solid ${cor}55`,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {TIPO_LABELS[tipo] ?? tipo}
    </span>
  )
}

export function IconePasta({ tamanho = 16, cor = '#7C6AF7' }: { tamanho?: number; cor?: string }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke={cor}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}
