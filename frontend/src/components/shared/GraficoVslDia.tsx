import { useMemo } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatNum, formatTaxa } from '@/lib/tokens'
import type { VslPontoDia } from '@/types'

import {
  COR_ENGAJAMENTO,
  COR_PLAY_RATE,
  COR_VIEWS,
  cartao,
  textoMudoVsl,
  tooltipCaixa,
} from './vslEstilos'

interface LinhaPlot extends VslPontoDia {
  data: string
}

/** Série diária das VSLs da categoria: barras de views/plays únicos e
 * linhas de play rate e engajamento (eixo % à direita). */
export function GraficoVslDia({ dias, cor }: { dias: VslPontoDia[]; cor: string }) {
  const dados: LinhaPlot[] = useMemo(
    () => dias.map((d) => ({ ...d, data: d.dia.slice(8, 10) + '/' + d.dia.slice(5, 7) })),
    [dias],
  )

  if (dados.length === 0) {
    return (
      <div style={{ ...cartao, textAlign: 'center' }}>
        <span style={textoMudoVsl}>Sem dados da VTurb no período selecionado.</span>
      </div>
    )
  }

  return (
    <div style={cartao}>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={dados} barGap={2} barSize={dados.length > 30 ? 5 : 12}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="data"
            tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval={dados.length > 20 ? Math.floor(dados.length / 10) : 0}
          />
          <YAxis
            yAxisId="qtd"
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
            tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <YAxis
            yAxisId="pct"
            orientation="right"
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip content={<TooltipVslDia />} cursor={{ fill: 'var(--border)' }} />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
          <Bar
            yAxisId="qtd"
            dataKey="views_unicas"
            name="Views únicas"
            fill={COR_VIEWS}
            fillOpacity={0.45}
            radius={[3, 3, 0, 0]}
          />
          <Bar
            yAxisId="qtd"
            dataKey="plays_unicos"
            name="Plays únicos"
            fill={cor}
            fillOpacity={0.8}
            radius={[3, 3, 0, 0]}
          />
          <Line
            yAxisId="pct"
            type="monotone"
            dataKey="play_rate"
            name="Play rate"
            stroke={COR_PLAY_RATE}
            strokeWidth={2}
            dot={{ r: 2, fill: COR_PLAY_RATE, strokeWidth: 0 }}
            connectNulls
          />
          <Line
            yAxisId="pct"
            type="monotone"
            dataKey="engajamento"
            name="Engajamento"
            stroke={COR_ENGAJAMENTO}
            strokeWidth={2}
            dot={{ r: 2, fill: COR_ENGAJAMENTO, strokeWidth: 0 }}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function TooltipVslDia({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ payload?: LinhaPlot }>
  label?: string
}) {
  const d = payload?.[0]?.payload
  if (!active || !d) return null
  const linhas: Array<[string, string]> = [
    ['Views únicas', formatNum(d.views_unicas)],
    ['Plays únicos', formatNum(d.plays_unicos)],
    ['Play rate', formatTaxa(d.play_rate)],
    ['Engajamento', formatTaxa(d.engajamento)],
    ['Cliques no botão', `${formatNum(d.cliques_unicos)} (${formatTaxa(d.taxa_clique)})`],
    ['Finalizações', formatNum(d.finalizacoes_unicas)],
    ['Conversões (pixel VTurb)', formatNum(d.conversoes_vturb)],
  ]
  return (
    <div style={tooltipCaixa}>
      <p style={{ margin: '0 0 6px', color: 'var(--text-muted)' }}>{label}</p>
      {linhas.map(([nome, valor]) => (
        <p key={nome} style={{ margin: '2px 0', color: 'var(--text)', display: 'flex', gap: 12, justifyContent: 'space-between' }}>
          <span style={{ color: 'var(--text-muted)' }}>{nome}</span>
          <strong>{valor}</strong>
        </p>
      ))}
    </div>
  )
}
