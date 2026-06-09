import { formatBRL, formatNum } from '@/lib/tokens'
import type { Canal } from '@/types'

const CORES = ['#7C6AF7', '#3ECFB2', '#F59E0B', '#EF4444', '#6366F1', '#EC4899']

export function BarraCanal({
  canais,
  onSelecionar,
}: {
  canais: Canal[]
  onSelecionar?: (canal: Canal) => void
}) {
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
          const clicavel = !!onSelecionar
          return (
            <button
              key={c.id}
              onClick={clicavel ? () => onSelecionar(c) : undefined}
              disabled={!clicavel}
              title={clicavel ? `Ver breakdown por utm_content de ${c.nome}` : ''}
              style={{
                background: 'transparent',
                border: 'none',
                padding: 0,
                margin: 0,
                width: '100%',
                textAlign: 'left',
                cursor: clicavel ? 'pointer' : 'default',
                borderRadius: 6,
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                if (clicavel) e.currentTarget.style.background = 'var(--border)'
              }}
              onMouseLeave={(e) => {
                if (clicavel) e.currentTarget.style.background = 'transparent'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 13, color: 'var(--text-strong)', fontWeight: 500 }}>{c.nome}</span>
                <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                    {formatNum(c.leads)} leads
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{formatBRL(c.investimento)}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: cor, minWidth: 80, textAlign: 'right' }}>
                    CPL R$ {cpl}
                  </span>
                  {clicavel && (
                    <span style={{ fontSize: 13, color: 'var(--text-dim)' }}>›</span>
                  )}
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
            </button>
          )
        })}
      </div>
    </div>
  )
}
