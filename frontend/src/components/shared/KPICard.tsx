interface KPICardProps {
  label: string
  valor: string
  sub?: string
  progresso?: number
  cor?: string
}

export function KPICard({ label, valor, sub, progresso, cor = '#7C6AF7' }: KPICardProps) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '1rem 1.25rem',
      }}
    >
      <p
        style={{
          fontSize: 11,
          color: 'var(--text-faint)',
          margin: '0 0 6px',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {label}
      </p>
      <p style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: 'var(--text)' }}>
        {valor}
      </p>
      {sub && <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: 0 }}>{sub}</p>}
      {progresso !== undefined && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Meta</span>
            <span style={{ fontSize: 11, color: cor, fontWeight: 600 }}>{progresso}%</span>
          </div>
          <div style={{ height: 4, background: 'var(--border)', borderRadius: 99 }}>
            <div
              style={{
                height: 4,
                width: `${progresso}%`,
                background: cor,
                borderRadius: 99,
                transition: 'width 0.5s',
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
