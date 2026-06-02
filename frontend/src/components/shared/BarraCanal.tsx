import { formatBRL, formatNum } from '@/lib/tokens'
import type { Canal } from '@/types'

const CORES = ['#7C6AF7', '#3ECFB2', '#F59E0B', '#EF4444', '#6366F1', '#EC4899']

export function BarraCanal({ canais }: { canais: Canal[] }) {
  const maxLeads = Math.max(...canais.map((c) => c.leads), 1)
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '1.25rem',
      }}
    >
      <p style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
        Leads por canal
      </p>
      <div style={{ display: 'grid', gap: 14 }}>
        {canais.map((c, i) => {
          const cpl = c.leads > 0 && c.investimento > 0 ? (c.investimento / c.leads).toFixed(2) : '–'
          const cor = CORES[i % CORES.length]
          return (
            <div key={c.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 13, color: 'var(--text-strong)', fontWeight: 500 }}>{c.nome}</span>
                <div style={{ display: 'flex', gap: 20 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                    {formatNum(c.leads)} leads
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{formatBRL(c.investimento)}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: cor, minWidth: 80, textAlign: 'right' }}>
                    CPL R$ {cpl}
                  </span>
                </div>
              </div>
              <div style={{ height: 6, background: 'var(--border)', borderRadius: 99 }}>
                <div
                  style={{
                    height: 6,
                    width: `${Math.round((c.leads / maxLeads) * 100)}%`,
                    background: cor,
                    borderRadius: 99,
                    transition: 'width 0.5s',
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
