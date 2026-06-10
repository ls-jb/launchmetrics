export function BotaoAtualizar({
  onClick,
  atualizando,
}: {
  onClick: () => void
  atualizando: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={atualizando}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border-strong)',
        color: 'var(--text-muted)',
        padding: '8px 14px',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        cursor: atualizando ? 'wait' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        opacity: atualizando ? 0.6 : 1,
        transition: 'opacity 0.15s, border-color 0.15s',
      }}
      onMouseEnter={(e) => {
        if (!atualizando) e.currentTarget.style.borderColor = '#7C6AF7'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-strong)'
      }}
      title="Recarregar dados"
    >
      <span
        style={{
          fontSize: 14,
          lineHeight: 1,
          display: 'inline-block',
          transformOrigin: 'center',
          animation: atualizando ? 'spin 0.8s linear infinite' : 'none',
        }}
      >
        ↻
      </span>
      {atualizando ? 'Atualizando…' : 'Atualizar'}
      <style>{`@keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }`}</style>
    </button>
  )
}
