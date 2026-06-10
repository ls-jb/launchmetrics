import { useEffect, useMemo, useState } from 'react'

import { GraficoReceitaDia } from './GraficoReceitaDia'
import type { CategoriaLancPago, PontoVendaCategoria } from '@/types'

const CATEGORIAS: { valor: CategoriaLancPago; label: string; cor: string }[] = [
  { valor: 'ingresso', label: 'Ingresso', cor: '#3ECFB2' },
  { valor: 'order_bump_ingresso', label: 'Order Bump (Ingresso)', cor: '#F59E0B' },
  { valor: 'principal', label: 'Principal', cor: '#7C6AF7' },
  { valor: 'order_bump_principal', label: 'Order Bump (Principal)', cor: '#F59E0B' },
  { valor: 'upsell', label: 'Upsell', cor: '#60A5FA' },
  { valor: 'downsell', label: 'Downsell', cor: 'var(--text-muted)' },
]

export function GraficoVendasCategoria({
  dados,
}: {
  dados: PontoVendaCategoria[]
}) {
  // Só mostra checkbox pras categorias que têm pelo menos 1 ponto.
  const categoriasDisponiveis = useMemo(() => {
    const conjunto = new Set(dados.map((d) => d.categoria))
    return CATEGORIAS.filter((c) => conjunto.has(c.valor))
  }, [dados])

  const chaveDisp = categoriasDisponiveis.map((c) => c.valor).join('|')
  const [selecionadas, setSelecionadas] = useState<Set<CategoriaLancPago>>(
    () => new Set(categoriasDisponiveis.map((c) => c.valor)),
  )

  // Quando o conjunto de categorias muda (carregamento async), marca tudo.
  useEffect(() => {
    setSelecionadas(new Set(categoriasDisponiveis.map((c) => c.valor)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDisp])

  // Soma por dia considerando só as categorias marcadas.
  const dadosFiltrados = useMemo(() => {
    const porDia: Record<string, { receita: number; quantidade: number }> = {}
    for (const ponto of dados) {
      if (!selecionadas.has(ponto.categoria)) continue
      const atual = porDia[ponto.dia] ?? { receita: 0, quantidade: 0 }
      atual.receita += Number(ponto.receita)
      atual.quantidade += ponto.quantidade
      porDia[ponto.dia] = atual
    }
    return Object.entries(porDia)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dia, v]) => ({
        data: dia.slice(8, 10) + '/' + dia.slice(5, 7),
        receita: v.receita,
        quantidade: v.quantidade,
      }))
  }, [dados, selecionadas])

  const alternar = (cat: CategoriaLancPago) => {
    setSelecionadas((prev) => {
      const novo = new Set(prev)
      if (novo.has(cat)) novo.delete(cat)
      else novo.add(cat)
      return novo
    })
  }

  if (categoriasDisponiveis.length === 0) {
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
        Sem vendas nesse lançamento para gerar o gráfico diário.
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
        {categoriasDisponiveis.map((c) => {
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
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: c.cor,
                  display: 'inline-block',
                }}
              />
              {c.label}
            </label>
          )
        })}
      </div>
      <GraficoReceitaDia dados={dadosFiltrados} />
    </div>
  )
}
