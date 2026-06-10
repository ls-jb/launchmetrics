import { useState } from 'react'

export function EditavelInline({
  label,
  valor,
  formatar,
  aoSalvar,
  destaque = false,
  cor = 'var(--text)',
}: {
  label: string
  valor: number | null
  formatar: (v: number) => string
  aoSalvar: (v: number | null) => Promise<void>
  /** quando true, mostra o valor em fonte grande (28px) — útil pra card
   * onde o valor é o foco visual. Some o badge com label. */
  destaque?: boolean
  /** cor do número em modo destaque. */
  cor?: string
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

  if (destaque && !editando) {
    return (
      <button
        onClick={iniciar}
        title={`Editar ${label.toLowerCase()}`}
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          margin: 0,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: valor != null ? cor : 'var(--text-dim)',
          fontSize: 28,
          fontWeight: 700,
        }}
      >
        {valor != null ? formatar(valor) : 'definir'}
        <span style={{ color: 'var(--text-dim)', fontSize: 13, fontWeight: 400 }}>✎</span>
      </button>
    )
  }

  if (destaque && editando) {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
            width: 200,
            background: 'var(--surface-2)',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            padding: '6px 12px',
            color: cor,
            fontSize: 26,
            fontWeight: 700,
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
            padding: '8px 14px',
            fontSize: 12,
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
            padding: '6px 10px',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          ×
        </button>
      </span>
    )
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
