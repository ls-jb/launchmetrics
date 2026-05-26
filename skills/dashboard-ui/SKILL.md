---
name: dashboard-ui
description: Componentes React prontos para o dashboard LaunchMetrics — KPICard, gráficos Recharts, filtros de data, tabelas de produtos e barras de progresso de meta. Use esta skill SEMPRE que for criar ou editar componentes visuais do frontend: cards de métricas, gráficos de linha ou barra, filtros de período, badges de status, ou qualquer elemento do design system do projeto. Também use ao estilizar novas telas para garantir consistência visual.
---

# Dashboard UI — LaunchMetrics

## Design system (tokens obrigatórios)

```typescript
// src/lib/tokens.ts
export const cores = {
  fundo: '#0B0F19',
  card: '#111827',
  borda: '#1F2937',
  bordaHover: '#374151',
  primaria: '#7C6AF7',
  sucesso: '#3ECFB2',
  atencao: '#F59E0B',
  erro: '#EF4444',
  textoPrimario: '#F9FAFB',
  textoSecundario: '#6B7280',
  textoMudo: '#4B5563',
} as const

export const formatBRL = (valor: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(valor)

export const formatNum = (valor: number) =>
  new Intl.NumberFormat('pt-BR').format(valor)

export const formatPct = (valor: number, meta: number) =>
  meta > 0 ? Math.min(Math.round((valor / meta) * 100), 100) : 0
```

---

## KPICard

```tsx
// src/components/shared/KPICard.tsx
interface KPICardProps {
  label: string
  valor: string
  sub?: string
  progresso?: number   // 0-100
  cor?: string
}

export function KPICard({ label, valor, sub, progresso, cor = '#7C6AF7' }: KPICardProps) {
  return (
    <div style={{
      background: '#111827',
      border: '1px solid #1F2937',
      borderRadius: 12,
      padding: '1rem 1.25rem',
    }}>
      <p style={{ fontSize: 11, color: '#6B7280', margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        {label}
      </p>
      <p style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: '#F9FAFB' }}>
        {valor}
      </p>
      {sub && <p style={{ fontSize: 12, color: '#6B7280', margin: 0 }}>{sub}</p>}
      {progresso !== undefined && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: '#6B7280' }}>Meta</span>
            <span style={{ fontSize: 11, color: cor, fontWeight: 600 }}>{progresso}%</span>
          </div>
          <div style={{ height: 4, background: '#1F2937', borderRadius: 99 }}>
            <div style={{ height: 4, width: `${progresso}%`, background: cor, borderRadius: 99, transition: 'width 0.5s' }} />
          </div>
        </div>
      )}
    </div>
  )
}
```

---

## Badge de status

```tsx
const STATUS_CORES: Record<string, string> = {
  pre_lancamento: '#F59E0B',
  captacao: '#3ECFB2',
  carrinho: '#7C6AF7',
  encerrado: '#6B7280',
}

const STATUS_LABELS: Record<string, string> = {
  pre_lancamento: 'Pré-lançamento',
  captacao: 'Captação',
  carrinho: 'Carrinho aberto',
  encerrado: 'Encerrado',
}

export function BadgeStatus({ status }: { status: string }) {
  const cor = STATUS_CORES[status] ?? '#6B7280'
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '3px 10px',
      borderRadius: 99, background: cor + '22', color: cor,
      border: `1px solid ${cor}44`, letterSpacing: '0.06em',
    }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
```

---

## Tooltip customizado para Recharts

```tsx
// src/components/shared/ChartTooltip.tsx
export function ChartTooltip({ active, payload, label, moeda = false }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: '#1F2937', border: '1px solid #374151',
      borderRadius: 8, padding: '8px 14px',
    }}>
      <p style={{ margin: '0 0 4px', fontSize: 12, color: '#9CA3AF' }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ margin: 0, fontSize: 13, fontWeight: 600, color: p.color ?? '#7C6AF7' }}>
          {moeda ? formatBRL(p.value) : formatNum(p.value)}
        </p>
      ))}
    </div>
  )
}
```

---

## Gráfico de linha — velocidade de leads

```tsx
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { ChartTooltip } from '@/components/shared/ChartTooltip'

interface PontoVelocidade { dia: string; leads: number }

export function GraficoVelocidade({ dados }: { dados: PontoVelocidade[] }) {
  return (
    <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: '1.25rem' }}>
      <p style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#E5E7EB' }}>
        Leads por dia
      </p>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={dados}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
          <XAxis dataKey="dia" tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} width={35} />
          <Tooltip content={<ChartTooltip />} />
          <Line type="monotone" dataKey="leads" stroke="#7C6AF7" strokeWidth={2} dot={false} activeDot={{ r: 5, fill: '#7C6AF7' }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

---

## Gráfico de barras — receita por dia

```tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

interface PontoDia { data: string; receita: number }

export function GraficoReceitaDia({ dados }: { dados: PontoDia[] }) {
  const barSize = dados.length > 20 ? 8 : 20
  return (
    <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: '1.25rem' }}>
      <p style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#E5E7EB' }}>
        Receita por dia
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={dados} barSize={barSize}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
          <XAxis dataKey="data" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false}
            interval={dados.length > 14 ? Math.floor(dados.length / 7) : 0} />
          <YAxis tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} tick={{ fill: '#6B7280', fontSize: 10 }}
            axisLine={false} tickLine={false} width={45} />
          <Tooltip content={<ChartTooltip moeda />} />
          <Bar dataKey="receita" fill="#7C6AF7" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
```

---

## Filtros de data (Dashboard de Vendas)

```tsx
// src/components/shared/FiltroData.tsx
import { useState } from 'react'
import { format, subDays } from 'date-fns'

interface FiltroDataProps {
  onChange: (inicio: string, fim: string) => void
}

const ATALHOS = [
  { label: 'Hoje', dias: 0 },
  { label: '7 dias', dias: 6 },
  { label: '30 dias', dias: 29 },
  { label: '90 dias', dias: 89 },
]

export function FiltroData({ onChange }: FiltroDataProps) {
  const hoje = format(new Date(), 'yyyy-MM-dd')
  const [inicio, setInicio] = useState(format(subDays(new Date(), 6), 'yyyy-MM-dd'))
  const [fim, setFim] = useState(hoje)

  const aplicar = (novoInicio: string, novoFim: string) => {
    setInicio(novoInicio)
    setFim(novoFim)
    onChange(novoInicio, novoFim)
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end',
      background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: '1rem 1.25rem' }}>
      <div>
        <label style={{ display: 'block', fontSize: 11, color: '#6B7280', marginBottom: 6 }}>Início</label>
        <input type="date" value={inicio}
          onChange={e => aplicar(e.target.value, fim)}
          style={{ background: '#0F172A', border: '1px solid #374151', borderRadius: 8,
            padding: '8px 12px', color: '#F9FAFB', fontSize: 13 }} />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 11, color: '#6B7280', marginBottom: 6 }}>Fim</label>
        <input type="date" value={fim}
          onChange={e => aplicar(inicio, e.target.value)}
          style={{ background: '#0F172A', border: '1px solid #374151', borderRadius: 8,
            padding: '8px 12px', color: '#F9FAFB', fontSize: 13 }} />
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {ATALHOS.map(a => (
          <button key={a.label}
            onClick={() => aplicar(format(subDays(new Date(), a.dias), 'yyyy-MM-dd'), hoje)}
            style={{ background: '#1F2937', border: '1px solid #374151', borderRadius: 6,
              color: '#9CA3AF', fontSize: 12, padding: '8px 12px', cursor: 'pointer' }}>
            {a.label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

---

## Barra de canal (leads por canal)

```tsx
const CORES = ['#7C6AF7', '#3ECFB2', '#F59E0B', '#EF4444', '#6366F1']

interface Canal { nome: string; leads: number; investimento: number }

export function BarraCanal({ canais }: { canais: Canal[] }) {
  const maxLeads = Math.max(...canais.map(c => c.leads), 1)
  return (
    <div style={{ background: '#111827', border: '1px solid #1F2937', borderRadius: 12, padding: '1.25rem' }}>
      <p style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#E5E7EB' }}>
        Leads por canal
      </p>
      <div style={{ display: 'grid', gap: 12 }}>
        {canais.map((c, i) => {
          const cpl = c.investimento > 0 ? (c.investimento / c.leads).toFixed(2) : '–'
          const cor = CORES[i % CORES.length]
          return (
            <div key={c.nome}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span style={{ fontSize: 13, color: '#E5E7EB' }}>{c.nome}</span>
                <div style={{ display: 'flex', gap: 20 }}>
                  <span style={{ fontSize: 12, color: '#6B7280' }}>{formatNum(c.leads)} leads</span>
                  <span style={{ fontSize: 12, color: '#6B7280' }}>{formatBRL(c.investimento)}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: cor }}>CPL R$ {cpl}</span>
                </div>
              </div>
              <div style={{ height: 6, background: '#1F2937', borderRadius: 99 }}>
                <div style={{ height: 6, width: `${Math.round((c.leads / maxLeads) * 100)}%`,
                  background: cor, borderRadius: 99 }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

---

## Grid de KPIs (uso padrão)

```tsx
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: '1.25rem' }}>
  <KPICard label="Leads captados" valor={formatNum(leads)} sub={`Meta: ${formatNum(metaLeads)}`} progresso={formatPct(leads, metaLeads)} />
  <KPICard label="Investimento" valor={formatBRL(investimento)} />
  <KPICard label="CPL médio" valor={`R$ ${cpl}`} cor="#3ECFB2" />
  <KPICard label="ROAS" valor={`${roas}x`} sub={`Meta: ${metaROAS}x`} progresso={formatPct(roas, metaROAS)} cor="#F59E0B" />
</div>
```
