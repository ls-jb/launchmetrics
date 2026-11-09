import { useState } from 'react'

export interface SerieLegenda {
  chave: string
  nome: string
  cor: string
  forma: 'barra' | 'linha'
}

/** Linha "Mostrar: [x] Série A [x] Série B…" — liga/desliga séries do
 * gráfico (mesmo visual das caixinhas do gráfico de vendas do perpétuo). */
export function LegendaSelecionavel({
  series,
  ativas,
  onAlternar,
}: {
  series: SerieLegenda[]
  ativas: Set<string>
  onAlternar: (chave: string) => void
}) {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
      <span style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 600 }}>Mostrar:</span>
      {series.map((s) => {
        const marcado = ativas.has(s.chave)
        return (
          <label
            key={s.chave}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 12,
              cursor: 'pointer',
              color: marcado ? 'var(--text)' : 'var(--text-faint)',
              userSelect: 'none',
            }}
          >
            <input
              type="checkbox"
              checked={marcado}
              onChange={() => onAlternar(s.chave)}
              style={{ accentColor: s.cor, cursor: 'pointer' }}
            />
            <span
              style={
                s.forma === 'barra'
                  ? { width: 10, height: 10, borderRadius: 2, background: s.cor, display: 'inline-block' }
                  : { width: 12, height: 2, background: s.cor, display: 'inline-block' }
              }
            />
            {s.nome}
          </label>
        )
      })}
    </div>
  )
}

/** Estado das séries ligadas: começa com `iniciais` marcadas. */
export function useSeriesAtivas(iniciais: string[]) {
  const [ativas, setAtivas] = useState<Set<string>>(() => new Set(iniciais))
  const alternar = (chave: string) =>
    setAtivas((prev) => {
      const novo = new Set(prev)
      if (novo.has(chave)) novo.delete(chave)
      else novo.add(chave)
      return novo
    })
  return [ativas, alternar] as const
}
