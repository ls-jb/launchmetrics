import { useEffect, useRef, useState } from 'react'
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

// Enquanto o ano é digitado o input já devolve datas "completas" tipo
// 0002-10-03, 0020-10-03... Só aplica sozinho quando o ano faz sentido.
const ANO_MINIMO = 2000

// Espera o usuário parar de mexer antes de aplicar (evita 1 request por tecla).
const ATRASO_APLICAR_MS = 400

function dataCompleta(valor: string): boolean {
  return FORMATO_DATA.test(valor) && Number(valor.slice(0, 4)) >= ANO_MINIMO
}

export function FiltroData({ onChange, inicioInicial, fimInicial }: FiltroDataProps) {
  const hoje = format(new Date(), 'yyyy-MM-dd')
  const inicioPadrao = inicioInicial ?? format(subDays(new Date(), 6), 'yyyy-MM-dd')
  const fimPadrao = fimInicial ?? hoje

  // `inicio`/`fim` = o que está nos inputs; `aplicadoRef` = o que já foi
  // mandado pro pai. Ref (e não state) porque o setTimeout precisa ler o
  // valor atual, não o da renderização em que foi agendado.
  const [inicio, setInicio] = useState(inicioPadrao)
  const [fim, setFim] = useState(fimPadrao)
  const aplicadoRef = useRef({ inicio: inicioPadrao, fim: fimPadrao })

  // Aplica assim que a data fica completa — o seletor nativo de data não
  // dispara blur ao escolher o dia, então esperar o blur deixava o input
  // mostrando um período e os números mostrando outro.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelarTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
  }
  useEffect(() => cancelarTimer, [])

  const commitar = (novoInicio: string, novoFim: string) => {
    cancelarTimer()
    const aplicado = aplicadoRef.current
    if (novoInicio === aplicado.inicio && novoFim === aplicado.fim) return
    aplicadoRef.current = { inicio: novoInicio, fim: novoFim }
    onChange(novoInicio, novoFim)
  }

  const aplicar = (novoInicio: string, novoFim: string) => {
    setInicio(novoInicio)
    setFim(novoFim)
    commitar(novoInicio, novoFim)
  }

  const agendarCommit = (novoInicio: string, novoFim: string) => {
    cancelarTimer()
    if (!dataCompleta(novoInicio) || !dataCompleta(novoFim)) return
    timerRef.current = setTimeout(() => commitar(novoInicio, novoFim), ATRASO_APLICAR_MS)
  }

  const alterarInicio = (valor: string) => {
    setInicio(valor)
    agendarCommit(valor, fim)
  }

  const alterarFim = (valor: string) => {
    setFim(valor)
    agendarCommit(inicio, valor)
  }

  // No blur/Enter aplica na hora; data incompleta volta pro último valor aplicado.
  const commitarInicio = () => {
    const aplicado = aplicadoRef.current
    if (!FORMATO_DATA.test(inicio)) {
      setInicio(aplicado.inicio)
      return
    }
    commitar(inicio, FORMATO_DATA.test(fim) ? fim : aplicado.fim)
  }

  const commitarFim = () => {
    const aplicado = aplicadoRef.current
    if (!FORMATO_DATA.test(fim)) {
      setFim(aplicado.fim)
      return
    }
    commitar(FORMATO_DATA.test(inicio) ? inicio : aplicado.inicio, fim)
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
          onChange={(e) => alterarInicio(e.target.value)}
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
          onChange={(e) => alterarFim(e.target.value)}
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
