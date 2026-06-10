import { useState } from 'react'

export function EditavelInline({
  label,
  valor,
  formatar,
  aoSalvar,
}: {
  label: string
  valor: number | null
  formatar: (v: number) => string
  aoSalvar: (v: number | null) => Promise<void>
}) {
  const [editando, setEditando] = useState(false)
  const [texto, setTexto] = useState(valor != null ? String(valor) : '')
  const [salvando, setSalvando] = useState(false)

  const iniciar = () => {
    setTexto(valor != null ? String(valor) : '')
    setEditando(true)
  }
  const cancelar = () => setEditando(false)

  const salvar = async () => {
    const t = texto.trim()
    const novo = t === '' ? null : Number(t)
    if (novo !== null && (Number.isNaN(novo) || novo < 0)) return
    if (novo === (valor ?? null)) {
      setEditando(false)
      return
    }
    setSalvando(true)
    try {
      await aoSalvar(novo)
      setEditando(false)
    } finally {
      setSalvando(false)
    }
  }

  if (!editando) {
    return (
      <button
        onClick={iniciar}
        title={`Editar ${label.toLowerCase()}`}
        style={{
          background: 'transparent',
          border: '1px dashed var(--border-strong)',
          borderRadius: 8,
          padding: '6px 10px',
          fontSize: 12,
          color: 'var(--text-muted)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span style={{ color: 'var(--text-faint)' }}>{label}:</span>
        <span style={{ color: valor != null ? 'var(--text)' : 'var(--text-dim)', fontWeight: 600 }}>
          {valor != null ? formatar(valor) : 'não definido'}
        </span>
        <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>✎</span>
      </button>
    )
  }

  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{label}:</span>
      <input
        autoFocus
        type="number"
        step="0.01"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') salvar()
          if (e.key === 'Escape') cancelar()
        }}
        disabled={salvando}
        style={{
          width: 120,
          background: 'var(--surface-2)',
          border: '1px solid var(--border-strong)',
          borderRadius: 6,
          padding: '4px 8px',
          color: 'var(--text)',
          fontSize: 12,
        }}
      />
      <button
        onClick={salvar}
        disabled={salvando}
        style={{
          background: '#7C6AF7',
          border: 'none',
          color: '#fff',
          borderRadius: 6,
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {salvando ? '…' : 'Salvar'}
      </button>
      <button
        onClick={cancelar}
        disabled={salvando}
        style={{
          background: 'transparent',
          border: '1px solid var(--border-strong)',
          color: 'var(--text-muted)',
          borderRadius: 6,
          padding: '3px 8px',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        ×
      </button>
    </span>
  )
}
