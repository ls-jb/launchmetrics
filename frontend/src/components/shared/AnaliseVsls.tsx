import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

import { extrairErro } from '@/lib/erro'
import { formatNum, formatTaxa } from '@/lib/tokens'
import { perpetuosService } from '@/services/perpetuosService'
import type { VslAnalise, VslAnaliseJanela, VslAnaliseLinha } from '@/types'

import { COR_CATEGORIA_VSL, avisoErro, botaoSecundarioVsl, cartao, textoMudoVsl, tituloSecaoVsl } from './vslEstilos'

type Coluna = 'retencao_1min' | 'retencao_5min' | 'retencao_pitch' | 'conversao_vturb' | 'play_rate'

const COLUNAS: Array<{ chave: Coluna; titulo: string; dica: string }> = [
  { chave: 'retencao_1min', titulo: '% 1 min', dica: 'Quem deu play e ainda assistia em 1:00' },
  { chave: 'retencao_5min', titulo: '% 5 min', dica: 'Quem deu play e ainda assistia em 5:00' },
  { chave: 'retencao_pitch', titulo: '% até o pitch', dica: 'Quem deu play e chegou ao pitch (cadastrado na VTurb)' },
  { chave: 'conversao_vturb', titulo: 'Conv.', dica: 'Conversões do pixel VTurb ÷ plays únicos (atribuição, não é venda)' },
  { chave: 'play_rate', titulo: 'Play rate', dica: 'Plays únicos ÷ views únicas' },
]

const GRADE = 'minmax(150px, 1.9fr) repeat(5, minmax(62px, 1fr))'
const COR_MELHOR = '#3ECFB2'

/** Quadro do topo do perpétuo: retenção (1 min, 5 min, pitch), conversão e
 * play rate de cada VSL vinculada nos últimos 7 e 30 dias. Janelas fixas —
 * não seguem o filtro de data (mesmas do painel da VTurb). Sem VSL
 * vinculada não aparece (a seção de VSLs mais abaixo mostra como vincular). */
export function AnaliseVsls({ perpetuoId, recarga }: { perpetuoId: string; recarga?: unknown }) {
  const [analise, setAnalise] = useState<VslAnalise | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const ultimaRef = useRef(0)

  const carregar = useCallback(async () => {
    const requisicao = ++ultimaRef.current
    setCarregando(true)
    setErro('')
    try {
      const a = await perpetuosService.analiseVsl(perpetuoId)
      if (requisicao === ultimaRef.current) setAnalise(a)
    } catch (e) {
      if (requisicao === ultimaRef.current) setErro(extrairErro(e))
    } finally {
      if (requisicao === ultimaRef.current) setCarregando(false)
    }
  }, [perpetuoId])

  useEffect(() => {
    carregar()
  }, [carregar, recarga])

  if (erro && !analise) {
    return (
      <div style={{ ...avisoErro, marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1 }}>Análise das VSLs: {erro}</span>
        <button type="button" onClick={carregar} style={botaoSecundarioVsl}>
          Tentar de novo
        </button>
      </div>
    )
  }
  if (!analise) {
    return carregando ? <p style={{ ...textoMudoVsl, margin: '0 0 1.5rem' }}>Carregando análise das VSLs…</p> : null
  }
  if (!analise.configurado || analise.janelas.length === 0) return null

  return (
    <section style={{ marginBottom: '1.5rem', opacity: carregando ? 0.6 : 1, transition: 'opacity 0.2s' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <h3 style={tituloSecaoVsl}>Análise das VSLs</h3>
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
          VTurb · períodos fixos, não seguem o filtro de data · melhor de cada coluna em verde
        </span>
      </div>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))' }}>
        {analise.janelas.map((j) => (
          <TabelaJanela key={j.dias} janela={j} />
        ))}
      </div>
    </section>
  )
}

const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

function TabelaJanela({ janela }: { janela: VslAnaliseJanela }) {
  const melhores = melhoresPorCategoria(janela.linhas)
  const variasCategorias = new Set(janela.linhas.map((l) => l.categoria)).size > 1
  return (
    <div style={{ ...cartao, padding: '1rem 1.1rem' }}>
      <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>
        Últimos {janela.dias} dias{' '}
        <span style={{ fontWeight: 500, color: 'var(--text-faint)' }}>
          {dataCurta(janela.inicio)} – {dataCurta(janela.fim)}
        </span>
      </p>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 470 }}>
          <div style={{ ...linha, color: 'var(--text-faint)', fontWeight: 600, fontSize: 11, borderBottom: '1px solid var(--border)' }}>
            <span>VSL</span>
            {COLUNAS.map((c) => (
              <span key={c.chave} style={numero} title={c.dica}>
                {c.titulo}
              </span>
            ))}
          </div>
          {janela.linhas.map((l, i) => (
            <LinhaVsl
              key={l.player_id}
              linha={l}
              melhores={melhores.get(l.categoria)}
              mostrarCategoria={variasCategorias && l.categoria !== janela.linhas[i - 1]?.categoria}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function LinhaVsl({
  linha: l,
  melhores,
  mostrarCategoria,
}: {
  linha: VslAnaliseLinha
  melhores?: Partial<Record<Coluna, number>>
  mostrarCategoria: boolean
}) {
  const nome = l.nome.replace(/\.mp4$/i, '')
  return (
    <>
      {mostrarCategoria && (
        <p style={{ margin: '10px 0 2px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: COR_CATEGORIA_VSL[l.categoria] }}>
          {l.categoria}
        </p>
      )}
      <div style={{ ...linha, borderBottom: '1px solid var(--border)', opacity: l.plays_unicos ? 1 : 0.5 }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, color: 'var(--text)' }} title={l.nome}>
            {nome}
          </span>
          <small style={{ color: 'var(--text-faint)', fontSize: 11 }}>
            {l.plays_unicos ? `${formatNum(l.plays_unicos)} plays` : 'sem plays no período'}
          </small>
        </span>
        {COLUNAS.map((c) => {
          const valor = l[c.chave]
          const destaque = valor !== null && melhores?.[c.chave] === valor
          return (
            <span key={c.chave} style={{ ...numero, fontSize: 14, color: destaque ? COR_MELHOR : 'var(--text)', fontWeight: destaque ? 700 : 500 }}>
              {formatTaxa(valor, 2)}
            </span>
          )
        })}
      </div>
    </>
  )
}

/** Maior valor de cada coluna, por categoria — só quando há pelo menos 2
 * VSLs com valor pra comparar (uma sozinha não é "a melhor"). */
function melhoresPorCategoria(linhas: VslAnaliseLinha[]) {
  const porCategoria = new Map<string, Partial<Record<Coluna, number>>>()
  for (const categoria of new Set(linhas.map((l) => l.categoria))) {
    const daCategoria = linhas.filter((l) => l.categoria === categoria)
    const melhores: Partial<Record<Coluna, number>> = {}
    for (const { chave } of COLUNAS) {
      const valores = daCategoria.map((l) => l[chave]).filter((v): v is number => v !== null)
      if (valores.length >= 2) melhores[chave] = Math.max(...valores)
    }
    porCategoria.set(categoria, melhores)
  }
  return porCategoria
}

const linha: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: GRADE,
  gap: 8,
  alignItems: 'center',
  padding: '8px 2px',
}

const numero: CSSProperties = {
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
}
