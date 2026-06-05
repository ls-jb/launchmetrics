import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { formatBRL, formatNum } from '@/lib/tokens'
import type { PontoReceita } from '@/types'

type Ponto = Pick<PontoReceita, 'receita' | 'quantidade'> & { data: string }

export function GraficoReceitaDia({ dados }: { dados: Ponto[] }) {
  const barSize = dados.length > 20 ? 8 : 20
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '1.25rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          margin: '0 0 16px',
        }}
      >
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
          Receita por dia
        </p>
        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--text-faint)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{ width: 10, height: 10, borderRadius: 2, background: '#7C6AF7' }}
            />
            Receita
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{ width: 14, height: 2, borderRadius: 2, background: '#3ECFB2' }}
            />
            Quantidade
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={240}>
        <ComposedChart data={dados} barSize={barSize}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis
            dataKey="data"
            tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval={dados.length > 14 ? Math.floor(dados.length / 7) : 0}
          />
          <YAxis
            yAxisId="receita"
            tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
            tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={50}
          />
          <YAxis
            yAxisId="quantidade"
            orientation="right"
            tickFormatter={(v) => formatNum(v)}
            tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={40}
            allowDecimals={false}
          />
          <Tooltip content={<TooltipReceitaQtd />} cursor={{ fill: 'var(--border)' }} />
          <Bar
            yAxisId="receita"
            dataKey="receita"
            fill="#7C6AF7"
            radius={[4, 4, 0, 0]}
          />
          <Line
            yAxisId="quantidade"
            type="monotone"
            dataKey="quantidade"
            stroke="#3ECFB2"
            strokeWidth={2}
            dot={{ r: 3, fill: '#3ECFB2', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#3ECFB2', strokeWidth: 0 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

interface TooltipPayloadItem {
  dataKey?: string
  value: number
}

function TooltipReceitaQtd({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const receita = payload.find((p) => p.dataKey === 'receita')?.value ?? 0
  const quantidade = payload.find((p) => p.dataKey === 'quantidade')?.value ?? 0
  return (
    <div
      style={{
        background: 'var(--border)',
        border: '1px solid var(--border-strong)',
        borderRadius: 8,
        padding: '8px 14px',
      }}
    >
      <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--text-muted)' }}>{label}</p>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#7C6AF7' }}>
        {formatBRL(receita)}
      </p>
      <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 600, color: '#3ECFB2' }}>
        {formatNum(quantidade)} {quantidade === 1 ? 'venda' : 'vendas'}
      </p>
    </div>
  )
}
