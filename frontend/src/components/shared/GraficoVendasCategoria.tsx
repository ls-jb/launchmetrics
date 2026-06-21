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

import { formatBRL } from '@/lib/tokens'
import type { CategoriaLancPago, PontoVendaCategoria } from '@/types'

const CATEGORIAS: { valor: CategoriaLancPago; label: string; cor: string }[] = [
  { valor: 'ingresso', label: 'Ingresso', cor: '#3ECFB2' },
  { valor: 'order_bump_ingresso', label: 'Order Bump (Ingresso)', cor: '#F59E0B' },
  { valor: 'principal', label: 'Principal', cor: '#7C6AF7' },
  { valor: 'order_bump_principal', label: 'Order Bump (Principal)', cor: '#EC4899' },
  { valor: 'upsell', label: 'Upsell', cor: '#60A5FA' },
  { valor: 'downsell', label: 'Downsell', cor: 'var(--text-muted)' },
]

const COR_INVESTIMENTO = '#F59E0B'

type LinhaPlot = Record<string, number | string>

export function GraficoVendasCategoria({
  dados,
  investimento,
}: {
  dados: PontoVendaCategoria[]
  investimento?: { dia: string; valor: number }[]
}) {
  // Categorias presentes no dataset
  const categoriasPresentes = useMemo(() => {
    const conjunto = new Set(dados.map((d) => d.categoria))
    return CATEGORIAS.filter((c) => conjunto.has(c.valor))
  }, [dados])

  const chaveDisp = categoriasPresentes.map((c) => c.valor).join('|')
  const [selecionadas, setSelecionadas] = useState<Set<CategoriaLancPago>>(
    () => new Set(categoriasPresentes.map((c) => c.valor)),
  )
  const [mostrarInvestimento, setMostrarInvestimento] = useState(true)

  useEffect(() => {
    setSelecionadas(new Set(categoriasPresentes.map((c) => c.valor)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDisp])

  const temInvestimento = (investimento?.length ?? 0) > 0

  // Combina vendas (por categoria) + investimento numa série única por dia
  const dadosPlot = useMemo(() => {
    const porDia: Record<string, LinhaPlot> = {}
    for (const v of dados) {
      if (!porDia[v.dia]) porDia[v.dia] = { dia: v.dia }
      const k = `receita_${v.categoria}`
      porDia[v.dia][k] = ((porDia[v.dia][k] as number) || 0) + Number(v.receita)
    }
    if (temInvestimento) {
      for (const i of investimento!) {
        if (!porDia[i.dia]) porDia[i.dia] = { dia: i.dia }
        porDia[i.dia].investimento = Number(i.valor)
      }
    }
    return Object.values(porDia)
      .sort((a, b) => (a.dia as string).localeCompare(b.dia as string))
      .map((d) => ({
        ...d,
        data: (d.dia as string).slice(8, 10) + '/' + (d.dia as string).slice(5, 7),
      }))
  }, [dados, investimento, temInvestimento])

  const alternar = (cat: CategoriaLancPago) => {
    setSelecionadas((prev) => {
      const novo = new Set(prev)
      if (novo.has(cat)) novo.delete(cat)
      else novo.add(cat)
      return novo
    })
  }

  if (categoriasPresentes.length === 0 && !temInvestimento) {
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
        Sem dados nesse lançamento pra gerar o gráfico diário.
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
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
        {categoriasPresentes.map((c) => {
          const marcado = selecionadas.has(c.valor)
          return (
            <label
              key={c.valor}
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
                onChange={() => alternar(c.valor)}
                style={{ accentColor: c.cor, cursor: 'pointer' }}
              />
              <span style={{ width: 10, height: 2, background: c.cor, display: 'inline-block' }} />
              {c.label}
            </label>
          )
        })}
        {temInvestimento && (
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
        )}
      </div>

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
            <Tooltip content={<TooltipCategoria />} cursor={{ fill: 'var(--border)' }} />
            {temInvestimento && mostrarInvestimento && (
              <Bar
                yAxisId="reais"
                dataKey="investimento"
                fill={COR_INVESTIMENTO}
                fillOpacity={0.45}
                radius={[3, 3, 0, 0]}
                name="Investimento"
              />
            )}
            {categoriasPresentes.map((c) =>
              selecionadas.has(c.valor) ? (
                <Line
                  key={c.valor}
                  yAxisId="reais"
                  type="monotone"
                  dataKey={`receita_${c.valor}`}
                  stroke={c.cor}
                  strokeWidth={2}
                  dot={{ r: 2, fill: c.cor, strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: c.cor, strokeWidth: 0 }}
                  name={c.label}
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
}

function TooltipCategoria({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: TooltipItem[]
  label?: string
}) {
  if (!active || !payload?.length) return null
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
        return (
          <p
            key={`${p.dataKey}-${i}`}
            style={{ margin: '2px 0', color: p.color || 'var(--text)', fontWeight: 600 }}
          >
            {p.name}: {formatBRL(p.value)}
          </p>
        )
      })}
    </div>
  )
}
