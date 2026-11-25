interface KPICardProps {
  label: string
  valor: string
  sub?: string
  progresso?: number
  cor?: string
  /** Cor do número (default: texto normal). */
  corValor?: string
  /** Explicação da métrica, mostrada no (i) ao passar o mouse. */
  dica?: string
  /** Mostra um botão (?) que chama esta função ao clicar (ex.: abrir
   * um pop-up com detalhes). */
  onAjuda?: () => void
  /** Texto do botão (?) ao passar o mouse. */
  tituloAjuda?: string
}

export function KPICard({
  label,
  valor,
  sub,
  progresso,
  cor = '#7C6AF7',
  corValor = 'var(--text)',
  dica,
  onAjuda,
  tituloAjuda,
}: KPICardProps) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '1rem 1.25rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 8,
          margin: '0 0 6px',
        }}
      >
        <p
          style={{
            fontSize: 11,
            color: 'var(--text-faint)',
            margin: 0,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {label}
        </p>
        {dica && (
          <span
            title={dica}
            aria-label={dica}
            style={{
              flexShrink: 0,
              width: 16,
              height: 16,
              borderRadius: 99,
              border: '1px solid var(--border-strong)',
              color: 'var(--text-faint)',
              fontSize: 10,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'help',
            }}
          >
            i
          </span>
        )}
        {onAjuda && (
          <button
            type="button"
            onClick={onAjuda}
            title={tituloAjuda}
            aria-label={tituloAjuda ?? 'Ver detalhes'}
            style={{
              flexShrink: 0,
              width: 18,
              height: 18,
              borderRadius: 99,
              border: '1px solid var(--border-strong)',
              background: 'transparent',
              color: 'var(--text-muted)',
              fontSize: 11,
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            ?
          </button>
        )}
      </div>
      <p style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: corValor }}>
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
