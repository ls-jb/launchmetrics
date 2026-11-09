import { useMemo } from 'react'
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

import { formatNum, formatTaxa } from '@/lib/tokens'
import type { VslPontoDia } from '@/types'

import { LegendaSelecionavel, useSeriesAtivas, type SerieLegenda } from './LegendaSelecionavel'
import {
  COR_CLIQUES,
  COR_CONVERSOES,
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

type ChaveSerie =
  | 'views_unicas'
  | 'plays_unicos'
  | 'cliques_unicos'
  | 'conversoes_vturb'
  | 'play_rate'
  | 'engajamento'

/** Eixo de cada série: quantidade (esquerda) ou porcentagem (direita). */
const EIXO: Record<ChaveSerie, 'qtd' | 'pct'> = {
  views_unicas: 'qtd',
  plays_unicos: 'qtd',
  cliques_unicos: 'qtd',
  conversoes_vturb: 'qtd',
  play_rate: 'pct',
  engajamento: 'pct',
}

const INICIAIS: ChaveSerie[] = ['views_unicas', 'plays_unicos', 'play_rate', 'engajamento']

/** Série diária das VSLs da categoria: barras de views/plays únicos, linhas
 * de play rate/engajamento (eixo % à direita) e, opcionais, cliques e
 * conversões do pixel. Cada série liga/desliga na caixinha acima. */
export function GraficoVslDia({ dias, cor }: { dias: VslPontoDia[]; cor: string }) {
  const [ativas, alternar] = useSeriesAtivas(INICIAIS)
  const dados: LinhaPlot[] = useMemo(
    () => dias.map((d) => ({ ...d, data: d.dia.slice(8, 10) + '/' + d.dia.slice(5, 7) })),
    [dias],
  )

  const series: Array<SerieLegenda & { chave: ChaveSerie }> = [
    { chave: 'views_unicas', nome: 'Views únicas', cor: COR_VIEWS, forma: 'barra' },
    { chave: 'plays_unicos', nome: 'Plays únicos', cor, forma: 'barra' },
    { chave: 'play_rate', nome: 'Play rate', cor: COR_PLAY_RATE, forma: 'linha' },
    { chave: 'engajamento', nome: 'Engajamento', cor: COR_ENGAJAMENTO, forma: 'linha' },
    { chave: 'cliques_unicos', nome: 'Cliques no botão', cor: COR_CLIQUES, forma: 'linha' },
    { chave: 'conversoes_vturb', nome: 'Conversões (pixel)', cor: COR_CONVERSOES, forma: 'linha' },
  ]
  const visiveis = series.filter((s) => ativas.has(s.chave))
  const temEixo = (eixo: 'qtd' | 'pct') => visiveis.some((s) => EIXO[s.chave] === eixo)
  // Com 1–3 dias (ex.: "Hoje") a linha vira só um ponto: aumenta pra aparecer.
  const raioPonto = dados.length <= 3 ? 5 : 2

  if (dados.length === 0) {
    return (
      <div style={{ ...cartao, textAlign: 'center' }}>
        <span style={textoMudoVsl}>Sem dados da VTurb no período selecionado.</span>
      </div>
    )
  }

  return (
    <div style={cartao}>
      <LegendaSelecionavel series={series} ativas={ativas} onAlternar={alternar} />
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={dados} barGap={2} barSize={dados.length > 30 ? 5 : dados.length > 3 ? 12 : 28}>
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
            hide={!temEixo('qtd')}
            tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
            tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={44}
          />
          <YAxis
            yAxisId="pct"
            orientation="right"
            hide={!temEixo('pct')}
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ fill: 'var(--text-faint)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip content={<TooltipVslDia />} cursor={{ fill: 'var(--border)' }} />
          {visiveis.map((s) =>
            s.forma === 'barra' ? (
              <Bar
                key={s.chave}
                yAxisId={EIXO[s.chave]}
                dataKey={s.chave}
                name={s.nome}
                fill={s.cor}
                fillOpacity={s.chave === 'views_unicas' ? 0.45 : 0.8}
                radius={[3, 3, 0, 0]}
              />
            ) : (
              <Line
                key={s.chave}
                yAxisId={EIXO[s.chave]}
                type="monotone"
                dataKey={s.chave}
                name={s.nome}
                stroke={s.cor}
                strokeWidth={2}
                dot={{ r: raioPonto, fill: s.cor, strokeWidth: 0 }}
                connectNulls
              />
            ),
          )}
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
