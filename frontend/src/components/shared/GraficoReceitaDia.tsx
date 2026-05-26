import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { ChartTooltip } from './ChartTooltip'
import type { PontoReceita } from '@/types'

export function GraficoReceitaDia({ dados }: { dados: PontoReceita[] }) {
  const barSize = dados.length > 20 ? 8 : 20
  return (
    <div
      style={{
        background: '#111827',
        border: '1px solid #1F2937',
        borderRadius: 12,
        padding: '1.25rem',
      }}
    >
      <p style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#E5E7EB' }}>
        Receita por dia
      </p>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={dados} barSize={barSize}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
          <XAxis
            dataKey="data"
            tick={{ fill: '#6B7280', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval={dados.length > 14 ? Math.floor(dados.length / 7) : 0}
          />
          <YAxis
            tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
            tick={{ fill: '#6B7280', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={50}
          />
          <Tooltip content={<ChartTooltip moeda />} cursor={{ fill: '#1F293744' }} />
          <Bar dataKey="receita" fill="#7C6AF7" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
