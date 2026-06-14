import { useEffect, useMemo, useState } from 'react'

import { GraficoReceitaDia } from './GraficoReceitaDia'
import type { PontoVendaProduto } from '@/types'

// Paleta cíclica — assina cor pra cada produto pela ordem em que aparece.
const CORES = ['#7C6AF7', '#3ECFB2', '#F59E0B', '#EF4444', '#60A5FA', '#EC4899', '#A78BFA']

export function GraficoVendasProduto({
  dados,
}: {
  dados: PontoVendaProduto[]
}) {
  // Lista de produtos distintos com pelo menos 1 ponto.
  const produtosDisponiveis = useMemo(() => {
    const set = new Set<string>()
    dados.forEach((d) => set.add(d.produto))
    return Array.from(set).map((p, i) => ({ valor: p, cor: CORES[i % CORES.length] }))
  }, [dados])

  const chave = produtosDisponiveis.map((p) => p.valor).join('|')
  const [selecionados, setSelecionados] = useState<Set<string>>(
    () => new Set(produtosDisponiveis.map((p) => p.valor)),
  )

  // Quando os produtos disponíveis mudam (carregamento async), marca todos.
  useEffect(() => {
    setSelecionados(new Set(produtosDisponiveis.map((p) => p.valor)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  // Soma por dia respeitando os checkboxes.
  const dadosFiltrados = useMemo(() => {
    const porDia: Record<string, { receita: number; quantidade: number }> = {}
    for (const ponto of dados) {
      if (!selecionados.has(ponto.produto)) continue
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
  }, [dados, selecionados])

  const alternar = (produto: string) => {
    setSelecionados((prev) => {
      const novo = new Set(prev)
      if (novo.has(produto)) novo.delete(produto)
      else novo.add(produto)
      return novo
    })
  }

  if (produtosDisponiveis.length === 0) {
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
        Sem vendas nesse perpétuo pra gerar o gráfico diário.
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
        {produtosDisponiveis.map((p) => {
          const marcado = selecionados.has(p.valor)
          return (
            <label
              key={p.valor}
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
                onChange={() => alternar(p.valor)}
                style={{ accentColor: p.cor, cursor: 'pointer' }}
              />
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: p.cor,
                  display: 'inline-block',
                }}
              />
              {p.valor}
            </label>
          )
        })}
      </div>
      <GraficoReceitaDia dados={dadosFiltrados} />
    </div>
  )
}
