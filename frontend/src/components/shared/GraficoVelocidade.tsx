import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { ChartTooltip } from './ChartTooltip'
import type { PontoVelocidade } from '@/types'

export function GraficoVelocidade({ dados }: { dados: PontoVelocidade[] }) {
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
        Leads por dia
      </p>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={dados}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
          <XAxis
            dataKey="dia"
            tick={{ fill: '#6B7280', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#6B7280', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={35}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#374151' }} />
          <Line
            type="monotone"
            dataKey="leads"
            stroke="#7C6AF7"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, fill: '#7C6AF7' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
