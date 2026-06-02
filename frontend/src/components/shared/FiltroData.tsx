import { useState } from 'react'
import { format, subDays } from 'date-fns'

interface FiltroDataProps {
  onChange: (inicio: string, fim: string) => void
  inicioInicial?: string
  fimInicial?: string
}

const ATALHOS = [
  { label: 'Hoje', dias: 0 },
  { label: '7 dias', dias: 6 },
  { label: '30 dias', dias: 29 },
  { label: '90 dias', dias: 89 },
]

export function FiltroData({ onChange, inicioInicial, fimInicial }: FiltroDataProps) {
  const hoje = format(new Date(), 'yyyy-MM-dd')
  const [inicio, setInicio] = useState(inicioInicial ?? format(subDays(new Date(), 6), 'yyyy-MM-dd'))
  const [fim, setFim] = useState(fimInicial ?? hoje)

  const aplicar = (novoInicio: string, novoFim: string) => {
    setInicio(novoInicio)
    setFim(novoFim)
    onChange(novoInicio, novoFim)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'flex-end',
      }}
    >
      <div>
        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-faint)', marginBottom: 6 }}>
          Início
        </label>
        <input
          type="date"
          value={inicio}
          onChange={(e) => aplicar(e.target.value, fim)}
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            padding: '8px 12px',
            color: 'var(--text)',
            fontSize: 13,
            colorScheme: 'dark',
          }}
        />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-faint)', marginBottom: 6 }}>
          Fim
        </label>
        <input
          type="date"
          value={fim}
          onChange={(e) => aplicar(inicio, e.target.value)}
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            padding: '8px 12px',
            color: 'var(--text)',
            fontSize: 13,
            colorScheme: 'dark',
          }}
        />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {ATALHOS.map((a) => (
          <button
            key={a.label}
            onClick={() => aplicar(format(subDays(new Date(), a.dias), 'yyyy-MM-dd'), hoje)}
            style={{
              background: 'var(--border)',
              border: '1px solid var(--border-strong)',
              borderRadius: 6,
              color: 'var(--text-muted)',
              fontSize: 12,
              padding: '8px 12px',
              cursor: 'pointer',
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}
