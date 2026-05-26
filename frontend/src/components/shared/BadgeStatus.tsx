import type { StatusLancamento } from '@/types'

const STATUS_CORES: Record<StatusLancamento, string> = {
  pre_lancamento: '#F59E0B',
  captacao: '#3ECFB2',
  carrinho: '#7C6AF7',
  encerrado: '#6B7280',
}

const STATUS_LABELS: Record<StatusLancamento, string> = {
  pre_lancamento: 'Pré-lançamento',
  captacao: 'Captação',
  carrinho: 'Carrinho aberto',
  encerrado: 'Encerrado',
}

export function BadgeStatus({ status }: { status: StatusLancamento }) {
  const cor = STATUS_CORES[status] ?? '#6B7280'
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 600,
        padding: '3px 10px',
        borderRadius: 99,
        background: cor + '22',
        color: cor,
        border: `1px solid ${cor}44`,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
