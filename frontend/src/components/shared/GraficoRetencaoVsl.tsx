import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { formatDuracao, formatNum, formatTaxa } from '@/lib/tokens'
import type { VslCurva, VslCurvaPonto } from '@/types'

import { COR_CLIQUES, COR_CONVERSOES, COR_PITCH, tooltipCaixa } from './vslEstilos'

/** Curva de retenção (% de quem deu play ainda assistindo em cada trecho
 * de 5 s) + cliques no botão e conversões em cada trecho. A linha
 * vertical marca o pitch cadastrado na VTurb. */
export function GraficoRetencaoVsl({ curva, cor }: { curva: VslCurva; cor: string }) {
  const fimEixo = curva.pontos.length ? curva.pontos[curva.pontos.length - 1].segundo : 0

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={curva.pontos} barSize={3}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="segundo"
          type="number"
          domain={[0, fimEixo]}
          tickFormatter={(v: number) => formatDuracao(v)}
          tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          tickCount={10}
        />
        <YAxis
          yAxisId="pct"
          domain={[0, 100]}
          tickFormatter={(v: number) => `${v}%`}
          tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        {/* Raiz quadrada: o pico de cliques no fim do vídeo (quem clica
            depois que acaba) não achata as barras do pitch. */}
        <YAxis
          yAxisId="qtd"
          orientation="right"
          scale="sqrt"
          allowDecimals={false}
          tickFormatter={(v: number) => (Number.isInteger(v) ? formatNum(v) : '')}
          tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={32}
        />
        <Tooltip content={<TooltipRetencao />} cursor={{ stroke: 'var(--border-strong)' }} />
        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
        {curva.pitch_seg ? (
          <ReferenceLine
            yAxisId="pct"
            x={curva.pitch_seg}
            stroke={COR_PITCH}
            strokeDasharray="4 4"
            label={{ value: `Pitch ${formatDuracao(curva.pitch_seg)}`, fill: COR_PITCH, fontSize: 11, position: 'insideTopRight' }}
          />
        ) : null}
        <Bar yAxisId="qtd" dataKey="cliques" name="Cliques no botão" fill={COR_CLIQUES} fillOpacity={0.7} />
        <Bar yAxisId="qtd" dataKey="conversoes" name="Conversões (pixel)" fill={COR_CONVERSOES} />
        <Line
          yAxisId="pct"
          type="monotone"
          dataKey="retencao"
          name="Retenção"
          stroke={cor}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: cor, strokeWidth: 0 }}
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

function TooltipRetencao({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload?: VslCurvaPonto }>
}) {
  const p = payload?.[0]?.payload
  if (!active || !p) return null
  return (
    <div style={tooltipCaixa}>
      <p style={{ margin: '0 0 6px', color: 'var(--text-muted)' }}>{formatDuracao(p.segundo)}</p>
      <p style={{ margin: '2px 0', color: 'var(--text)', fontWeight: 600 }}>
        Retenção: {formatTaxa(p.retencao)}
        {p.usuarios !== null && (
          <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}> · {formatNum(p.usuarios)} pessoas</span>
        )}
      </p>
      {p.cliques > 0 && <p style={{ margin: '2px 0', color: COR_CLIQUES }}>Cliques: {formatNum(p.cliques)}</p>}
      {p.conversoes > 0 && (
        <p style={{ margin: '2px 0', color: COR_CONVERSOES }}>Conversões (pixel): {formatNum(p.conversoes)}</p>
      )}
    </div>
  )
}
