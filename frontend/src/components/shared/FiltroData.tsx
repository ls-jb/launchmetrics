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

// Regex de YYYY-MM-DD completo. Datas parciais do input (ex: enquanto o
// usuário digita "2026-06") devolvem string vazia e não são commitadas.
const FORMATO_DATA = /^\d{4}-\d{2}-\d{2}$/

export function FiltroData({ onChange, inicioInicial, fimInicial }: FiltroDataProps) {
  const hoje = format(new Date(), 'yyyy-MM-dd')
  const inicioPadrao = inicioInicial ?? format(subDays(new Date(), 6), 'yyyy-MM-dd')
  const fimPadrao = fimInicial ?? hoje

  // 2 níveis de state: o que está commitado (manda pro pai) e o que está
  // sendo digitado (só atualiza o pai no blur ou Enter). Assim, evita o
  // 422 do backend a cada tecla.
  const [inicioCommit, setInicioCommit] = useState(inicioPadrao)
  const [fimCommit, setFimCommit] = useState(fimPadrao)
  const [inicio, setInicio] = useState(inicioPadrao)
  const [fim, setFim] = useState(fimPadrao)

  const aplicar = (novoInicio: string, novoFim: string) => {
    setInicio(novoInicio)
    setFim(novoFim)
    setInicioCommit(novoInicio)
    setFimCommit(novoFim)
    onChange(novoInicio, novoFim)
  }

  const commitarInicio = () => {
    if (!FORMATO_DATA.test(inicio)) {
      // Data incompleta/inválida: volta pro último valor aplicado.
      setInicio(inicioCommit)
      return
    }
    if (inicio === inicioCommit) return
    setInicioCommit(inicio)
    onChange(inicio, fimCommit)
  }

  const commitarFim = () => {
    if (!FORMATO_DATA.test(fim)) {
      setFim(fimCommit)
      return
    }
    if (fim === fimCommit) return
    setFimCommit(fim)
    onChange(inicioCommit, fim)
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
          onChange={(e) => setInicio(e.target.value)}
          onBlur={commitarInicio}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLInputElement).blur()
            }
          }}
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
          onChange={(e) => setFim(e.target.value)}
          onBlur={commitarFim}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLInputElement).blur()
            }
          }}
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
