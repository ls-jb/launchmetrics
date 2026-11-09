import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'

import { extrairErro } from '@/lib/erro'
import { formatNum, formatTaxa } from '@/lib/tokens'
import { perpetuosService } from '@/services/perpetuosService'
import type { CategoriaVsl, VslAnalise, VslAnaliseJanela, VslAnaliseLinha } from '@/types'

import { COR_CATEGORIA_VSL, avisoErro, botaoSecundarioVsl, cartao, rotuloGrupo, textoMudoVsl } from './vslEstilos'

type Coluna = 'retencao_1min' | 'retencao_5min' | 'retencao_pitch' | 'conversao_vturb' | 'play_rate'

const COLUNAS: Array<{ chave: Coluna; titulo: string; dica: string }> = [
  { chave: 'retencao_1min', titulo: '% 1 min', dica: 'Quem deu play e ainda assistia em 1:00' },
  { chave: 'retencao_5min', titulo: '% 5 min', dica: 'Quem deu play e ainda assistia em 5:00' },
  { chave: 'retencao_pitch', titulo: '% até o pitch', dica: 'Quem deu play e chegou ao pitch (cadastrado na VTurb)' },
  { chave: 'conversao_vturb', titulo: 'Conv.', dica: 'Conversões do pixel VTurb ÷ plays únicos (atribuição, não é venda)' },
  { chave: 'play_rate', titulo: 'Play rate', dica: 'Plays únicos ÷ views únicas' },
]

const GRADE = 'minmax(170px, 2.2fr) repeat(5, minmax(62px, 1fr))'
const COR_MELHOR = '#3ECFB2'

/** Primeiro bloco da seção "VSLs (VTurb)": retenção (1 min, 5 min, pitch),
 * conversão e play rate das VSLs da categoria escolhida nos últimos 7 e 30
 * dias. Janelas fixas — não seguem o filtro de data (mesmas do painel da
 * VTurb). As caixinhas "Comparar" escolhem quais VSLs entram (fica salvo
 * neste navegador). Sem VSL vinculada não aparece. */
export function AnaliseVsls({
  perpetuoId,
  categoria,
  recarga,
}: {
  perpetuoId: string
  /** Só as VSLs dessa categoria (a pílula ativa da seção). Sem = todas. */
  categoria?: CategoriaVsl
  recarga?: unknown
}) {
  const { analise, carregando, erro, carregar } = useAnaliseVsl(perpetuoId, recarga)
  const [ocultas, alternar] = useVslsOcultas(perpetuoId)

  if (erro && !analise) {
    return (
      <div style={{ ...avisoErro, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1 }}>Análise das VSLs: {erro}</span>
        <button type="button" onClick={carregar} style={botaoSecundarioVsl}>
          Tentar de novo
        </button>
      </div>
    )
  }
  if (!analise) return carregando ? <p style={{ ...textoMudoVsl, margin: 0 }}>Carregando análise das VSLs…</p> : null
  if (!analise.configurado) return null
  const { vsls, efetivas, janelas } = visiveis(analise.janelas, categoria, ocultas)
  if (vsls.length === 0) return null

  return (
    <div style={{ opacity: carregando ? 0.6 : 1, transition: 'opacity 0.2s' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
        <p style={{ ...rotuloGrupo, margin: 0 }}>Análise das VSLs — últimos 7 e 30 dias</p>
        <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
          períodos fixos, não seguem o filtro de data · melhor de cada coluna em verde (VSLs com 100+ plays)
        </span>
      </div>
      {vsls.length > 1 && <SeletorVsls vsls={vsls} ocultas={efetivas} onAlternar={alternar} />}
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))' }}>
        {janelas.map((j) => (
          <TabelaJanela key={j.dias} janela={j} />
        ))}
      </div>
    </div>
  )
}

/** VSLs da categoria e janelas só com as marcadas em "Comparar". */
function visiveis(todas: VslAnaliseJanela[], categoria: CategoriaVsl | undefined, ocultas: Set<string>) {
  const daCategoria = todas.map((j) => ({
    ...j,
    linhas: categoria ? j.linhas.filter((l) => l.categoria === categoria) : j.linhas,
  }))
  const vsls = daCategoria.length ? daCategoria[daCategoria.length - 1].linhas : []
  // Escolha salva que esconde todas (ex.: VSLs revinculadas) → mostra todas.
  const efetivas = vsls.every((v) => ocultas.has(v.player_id)) ? new Set<string>() : ocultas
  const janelas = daCategoria.map((j) => ({ ...j, linhas: j.linhas.filter((l) => !efetivas.has(l.player_id)) }))
  return { vsls, efetivas, janelas }
}

function useAnaliseVsl(perpetuoId: string, recarga: unknown) {
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

  return { analise, carregando, erro, carregar }
}

// ============================================================
// Quais VSLs entram na comparação
// ============================================================
/** Guarda as DESMARCADAS (não as marcadas): VSL vinculada depois já
 * entra na comparação sem ninguém precisar marcar. */
const chaveOcultas = (perpetuoId: string) => `launchmetrics:analise-vsls:ocultas:${perpetuoId}`

function lerOcultas(perpetuoId: string): Set<string> {
  try {
    const salvo: unknown = JSON.parse(localStorage.getItem(chaveOcultas(perpetuoId)) ?? '[]')
    return new Set(Array.isArray(salvo) ? salvo.filter((v): v is string => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

function useVslsOcultas(perpetuoId: string) {
  const [ocultas, setOcultas] = useState<Set<string>>(() => lerOcultas(perpetuoId))
  useEffect(() => setOcultas(lerOcultas(perpetuoId)), [perpetuoId])

  const alternar = (playerId: string) =>
    setOcultas((prev) => {
      const novo = new Set(prev)
      if (novo.has(playerId)) novo.delete(playerId)
      else novo.add(playerId)
      try {
        localStorage.setItem(chaveOcultas(perpetuoId), JSON.stringify([...novo]))
      } catch {
        // sem localStorage (aba anônima etc.): a escolha só não fica salva
      }
      return novo
    })
  return [ocultas, alternar] as const
}

function SeletorVsls({
  vsls,
  ocultas,
  onAlternar,
}: {
  vsls: VslAnaliseLinha[]
  ocultas: Set<string>
  onAlternar: (playerId: string) => void
}) {
  const marcadas = vsls.filter((v) => !ocultas.has(v.player_id)).length
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
      <span style={{ fontSize: 12, color: 'var(--text-faint)', fontWeight: 600 }}>Comparar:</span>
      {vsls.map((v) => {
        const marcado = !ocultas.has(v.player_id)
        const ultima = marcado && marcadas === 1
        return (
          <label
            key={v.player_id}
            title={ultima ? 'Deixe pelo menos uma VSL marcada' : v.nome}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, maxWidth: 300, userSelect: 'none', cursor: ultima ? 'not-allowed' : 'pointer', color: marcado ? 'var(--text)' : 'var(--text-faint)' }}
          >
            <input
              type="checkbox"
              checked={marcado}
              disabled={ultima}
              onChange={() => onAlternar(v.player_id)}
              style={{ accentColor: COR_CATEGORIA_VSL[v.categoria], cursor: 'inherit' }}
            />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nomeCurto(v.nome)}</span>
          </label>
        )
      })}
    </div>
  )
}

// ============================================================
// Tabela de uma janela
// ============================================================
const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const nomeCurto = (nome: string) => nome.replace(/\.mp4$/i, '')

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
  const nome = nomeCurto(l.nome)
  return (
    <>
      {mostrarCategoria && (
        <p style={{ margin: '10px 0 2px', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: COR_CATEGORIA_VSL[l.categoria] }}>
          {l.categoria}
        </p>
      )}
      <div style={{ ...linha, borderBottom: '1px solid var(--border)', opacity: l.plays_unicos ? 1 : 0.5 }}>
        <span style={{ minWidth: 0 }}>
          {/* Até 2 linhas: os nomes costumam começar iguais e diferir no fim */}
          <span style={nomeVsl} title={l.nome}>
            {nome}
          </span>
          <small style={{ color: amostraPequena(l) ? '#F59E0B' : 'var(--text-faint)', fontSize: 11 }}>
            {!l.plays_unicos
              ? 'sem plays no período'
              : `${formatNum(l.plays_unicos)} plays${amostraPequena(l) ? ' · amostra pequena' : ''}`}
          </small>
        </span>
        {COLUNAS.map((c) => {
          const valor = l[c.chave]
          const destaque = valor !== null && !amostraPequena(l) && melhores?.[c.chave] === valor
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

/** Com poucos plays a taxa oscila demais (7 plays → 3 de 7 = 42,86%):
 * a VSL aparece, mas não disputa o destaque de "melhor". */
const PLAYS_MINIMOS_DESTAQUE = 100
const amostraPequena = (l: VslAnaliseLinha) => l.plays_unicos > 0 && l.plays_unicos < PLAYS_MINIMOS_DESTAQUE

/** Maior valor de cada coluna, por categoria — só quando há pelo menos 2
 * VSLs com amostra suficiente pra comparar (uma sozinha não é "a melhor"). */
function melhoresPorCategoria(linhas: VslAnaliseLinha[]) {
  const porCategoria = new Map<string, Partial<Record<Coluna, number>>>()
  for (const categoria of new Set(linhas.map((l) => l.categoria))) {
    const daCategoria = linhas.filter((l) => l.categoria === categoria && l.plays_unicos >= PLAYS_MINIMOS_DESTAQUE)
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

const nomeVsl: CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 2,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
  fontSize: 13,
  lineHeight: 1.3,
  fontWeight: 600,
  color: 'var(--text)',
  wordBreak: 'break-word',
}

const numero: CSSProperties = {
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
}
