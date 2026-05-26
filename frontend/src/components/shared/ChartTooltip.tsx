import { formatBRL, formatNum } from '@/lib/tokens'

interface ChartTooltipProps {
  active?: boolean
  payload?: Array<{ value: number; color?: string }>
  label?: string
  moeda?: boolean
}

export function ChartTooltip({ active, payload, label, moeda = false }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div
      style={{
        background: '#1F2937',
        border: '1px solid #374151',
        borderRadius: 8,
        padding: '8px 14px',
      }}
    >
      <p style={{ margin: '0 0 4px', fontSize: 12, color: '#9CA3AF' }}>{label}</p>
      {payload.map((p, i) => (
        <p
          key={i}
          style={{ margin: 0, fontSize: 13, fontWeight: 600, color: p.color ?? '#7C6AF7' }}
        >
          {moeda ? formatBRL(p.value) : formatNum(p.value)}
        </p>
      ))}
    </div>
  )
}
