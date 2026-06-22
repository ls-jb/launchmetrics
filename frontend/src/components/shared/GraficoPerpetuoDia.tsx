import { useEffect, useMemo, useState } from 'react'
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
import type {
  CategoriaPerpetuo,
  PontoInvestimentoDia,
  PontoVendaCategoriaPerp,
} from '@/types'

// 1 cor por categoria + 1 cor pro investimento.
const CORES: Record<CategoriaPerpetuo, string> = {
  Principal: '#7C6AF7',
  'Order Bump': '#F59E0B',
  Upsell: '#60A5FA',
  Downsell: '#EC4899',
  Outros: '#6B7280',
}

const CATEGORIAS_FIXAS: CategoriaPerpetuo[] = [
  'Principal',
  'Order Bump',
  'Upsell',
  'Downsell',
  'Outros',
]

const COR_INVESTIMENTO = '#3ECFB2'

type LinhaPlot = Record<string, number | string>

export function GraficoPerpetuoDia({
  vendas,
  investimento,
}: {
  vendas: PontoVendaCategoriaPerp[]
  investimento: PontoInvestimentoDia[]
}) {
  // Categorias presentes no dataset (pra montar checkboxes)
  const categoriasPresentes = useMemo(() => {
    const set = new Set<CategoriaPerpetuo>()
    vendas.forEach((v) => set.add(v.categoria))
    return CATEGORIAS_FIXAS.filter((c) => set.has(c))
  }, [vendas])

  const chave = categoriasPresentes.join('|')
  const [selecionadas, setSelecionadas] = useState<Set<CategoriaPerpetuo>>(
    () => new Set(categoriasPresentes),
  )
  const [mostrarInvestimento, setMostrarInvestimento] = useState(true)

  useEffect(() => {
    setSelecionadas(new Set(categoriasPresentes))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  // Combina vendas + investimento numa série única por dia
  const dadosPlot = useMemo(() => {
    const porDia: Record<string, LinhaPlot> = {}
    for (const v of vendas) {
      if (!porDia[v.dia]) porDia[v.dia] = { dia: v.dia }
      const linha = porDia[v.dia]
      const kr = `receita_${v.categoria}`
      const kq = `qtd_${v.categoria}`
      linha[kr] = ((linha[kr] as number) || 0) + Number(v.receita)
      linha[kq] = ((linha[kq] as number) || 0) + Number(v.quantidade)
    }
    for (const i of investimento) {
      if (!porDia[i.dia]) porDia[i.dia] = { dia: i.dia }
      porDia[i.dia].investimento = Number(i.valor)
    }
    return Object.values(porDia)
      .sort((a, b) => (a.dia as string).localeCompare(b.dia as string))
      .map((d) => ({
        ...d,
        data: (d.dia as string).slice(8, 10) + '/' + (d.dia as string).slice(5, 7),
      }))
  }, [vendas, investimento])

  const alternar = (cat: CategoriaPerpetuo) => {
    setSelecionadas((prev) => {
      const novo = new Set(prev)
      if (novo.has(cat)) novo.delete(cat)
      else novo.add(cat)
      return novo
    })
  }

  if (dadosPlot.length === 0) {
    return (
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '1.5rem',
          textAlign: 'center',
          color: 'var(--text-faint)',
          fontSize: 13,
        }}
      >
        Sem dados no período selecionado.
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* Checkboxes */}
      <div
        style={{
          display: 'flex',
          gap: 14,
          flexWrap: 'wrap',
          padding: '10px 14px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 600 }}>
          Mostrar:
        </span>
        {categoriasPresentes.map((cat) => {
          const marcado = selecionadas.has(cat)
          return (
            <label
              key={cat}
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
                onChange={() => alternar(cat)}
                style={{ accentColor: CORES[cat], cursor: 'pointer' }}
              />
              <span
                style={{
                  width: 10,
                  height: 2,
                  background: CORES[cat],
                  display: 'inline-block',
                }}
              />
              {cat}
            </label>
          )
        })}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            cursor: 'pointer',
            color: mostrarInvestimento ? 'var(--text)' : 'var(--text-faint)',
            userSelect: 'none',
            marginLeft: 'auto',
          }}
        >
          <input
            type="checkbox"
            checked={mostrarInvestimento}
            onChange={() => setMostrarInvestimento((v) => !v)}
            style={{ accentColor: COR_INVESTIMENTO, cursor: 'pointer' }}
          />
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: COR_INVESTIMENTO,
              display: 'inline-block',
            }}
          />
          Investimento (barra)
        </label>
      </div>

      {/* Gráfico */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '1.25rem',
        }}
      >
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={dadosPlot} barSize={dadosPlot.length > 30 ? 6 : 14}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="data"
              tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval={dadosPlot.length > 20 ? Math.floor(dadosPlot.length / 10) : 0}
            />
            <YAxis
              yAxisId="reais"
              tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
              tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={50}
            />
            <Tooltip content={<TooltipPerpetuo />} cursor={{ fill: 'var(--border)' }} />
            {mostrarInvestimento && (
              <Bar
                yAxisId="reais"
                dataKey="investimento"
                fill={COR_INVESTIMENTO}
                fillOpacity={0.45}
                radius={[3, 3, 0, 0]}
                name="Investimento"
              />
            )}
            {categoriasPresentes.map((cat) =>
              selecionadas.has(cat) ? (
                <Line
                  key={cat}
                  yAxisId="reais"
                  type="monotone"
                  dataKey={`receita_${cat}`}
                  stroke={CORES[cat]}
                  strokeWidth={2}
                  dot={{ r: 2, fill: CORES[cat], strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: CORES[cat], strokeWidth: 0 }}
                  name={cat}
                  connectNulls
                />
              ) : null,
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

interface TooltipItem {
  dataKey?: string
  value: number
  color?: string
  name?: string
  payload?: Record<string, number | string>
}

function TooltipPerpetuo({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipItem[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  const linha = payload[0]?.payload || {}
  return (
    <div
      style={{
        background: 'var(--border)',
        border: '1px solid var(--border-strong)',
        borderRadius: 8,
        padding: '8px 12px',
        fontSize: 12,
      }}
    >
      <p style={{ margin: '0 0 6px', color: 'var(--text-muted)' }}>{label}</p>
      {payload.map((p, i) => {
        if (!p.value) return null
        const ehInvestimento = p.dataKey === 'investimento'
        const qtd = ehInvestimento
          ? null
          : Number(
              linha[(p.dataKey || '').replace('receita_', 'qtd_')] || 0,
            )
        return (
          <p
            key={`${p.dataKey}-${i}`}
            style={{
              margin: '2px 0',
              color: p.color || 'var(--text)',
              fontWeight: 600,
            }}
          >
            {ehInvestimento ? 'Investimento' : p.name}: {formatBRL(p.value)}
            {qtd !== null && qtd > 0 && (
              <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                {' · '}
                {formatNum(qtd)} {qtd === 1 ? 'venda' : 'vendas'}
              </span>
            )}
          </p>
        )
      })}
    </div>
  )
}

