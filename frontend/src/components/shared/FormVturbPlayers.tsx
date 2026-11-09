import { useEffect, useMemo, useState } from 'react'

import { extrairErro } from '@/lib/erro'
import { formatDuracao, formatNum } from '@/lib/tokens'
import { perpetuosService } from '@/services/perpetuosService'
import type { CategoriaVsl, VturbPlayerDisponivel, VturbPlayerVinculo } from '@/types'

import {
  CATEGORIAS_VSL,
  COR_CATEGORIA_VSL,
  avisoErro,
  botaoPrimarioVsl,
  botaoSecundarioVsl,
  inputVsl,
  rotuloGrupo,
  selectVsl,
  textoMudoVsl,
} from './vslEstilos'

/** Conteúdo do modal "Gerenciar VSLs": VSLs já vinculadas (trocar
 * categoria / remover) + lista da conta VTurb pra vincular novas. */
export function FormVturbPlayers({
  perpetuoId,
  vinculos,
  onMudou,
}: {
  perpetuoId: string
  vinculos: VturbPlayerVinculo[]
  /** Chamado depois de qualquer mudança — recarrega o painel. */
  onMudou: () => Promise<void> | void
}) {
  const [disponiveis, setDisponiveis] = useState<VturbPlayerDisponivel[] | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let ativo = true
    perpetuosService
      .vturbPlayersDisponiveis()
      .then((lista) => ativo && setDisponiveis(lista))
      .catch((e) => {
        if (!ativo) return
        setDisponiveis([])
        setErro(extrairErro(e))
      })
    return () => {
      ativo = false
    }
  }, [])

  const porId = useMemo(
    () => new Map((disponiveis ?? []).map((p) => [p.player_id, p])),
    [disponiveis],
  )

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <VslsVinculadas vinculos={vinculos} porId={porId} onMudou={onMudou} onErro={setErro} />
      <AdicionarVsls
        perpetuoId={perpetuoId}
        disponiveis={disponiveis}
        jaVinculados={new Set(vinculos.map((v) => v.player_id))}
        onMudou={onMudou}
        onErro={setErro}
      />
      {erro && <div style={avisoErro}>{erro}</div>}
    </div>
  )
}

function VslsVinculadas({
  vinculos,
  porId,
  onMudou,
  onErro,
}: {
  vinculos: VturbPlayerVinculo[]
  porId: Map<string, VturbPlayerDisponivel>
  onMudou: () => Promise<void> | void
  onErro: (msg: string) => void
}) {
  const [ocupado, setOcupado] = useState<string | null>(null)

  const executar = async (vinculoId: string, acao: () => Promise<unknown>) => {
    onErro('')
    setOcupado(vinculoId)
    try {
      await acao()
      await onMudou()
    } catch (e) {
      onErro(extrairErro(e))
    } finally {
      setOcupado(null)
    }
  }

  const remover = (v: VturbPlayerVinculo, nome: string) => {
    if (!confirm(`Desvincular "${nome}" deste perpétuo?`)) return
    executar(v.id, () => perpetuosService.removerVturbPlayer(v.id))
  }

  return (
    <div>
      <p style={rotuloGrupo}>VSLs vinculadas ({vinculos.length})</p>
      {vinculos.length === 0 ? (
        <p style={{ ...textoMudoVsl, margin: 0 }}>Nenhuma VSL vinculada ainda.</p>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          {vinculos.map((v) => {
            const nome = porId.get(v.player_id)?.nome ?? v.player_nome ?? v.player_id
            return (
              <div key={v.id} style={linhaVinculada(ocupado === v.id)}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: COR_CATEGORIA_VSL[v.categoria], flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={nome}>
                  {nome}
                </span>
                <SelectCategoria
                  valor={v.categoria}
                  onChange={(cat) => executar(v.id, () => perpetuosService.atualizarVturbPlayer(v.id, cat))}
                />
                <button type="button" onClick={() => remover(v, nome)} style={botaoRemover} title="Desvincular">
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AdicionarVsls({
  perpetuoId,
  disponiveis,
  jaVinculados,
  onMudou,
  onErro,
}: {
  perpetuoId: string
  disponiveis: VturbPlayerDisponivel[] | null
  jaVinculados: Set<string>
  onMudou: () => Promise<void> | void
  onErro: (msg: string) => void
}) {
  const [filtro, setFiltro] = useState('')
  // player_id → categoria escolhida (presença = selecionado)
  const [selecionados, setSelecionados] = useState<Record<string, CategoriaVsl>>({})
  const [enviando, setEnviando] = useState(false)

  const filtrados = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    return (disponiveis ?? []).filter(
      (p) => !jaVinculados.has(p.player_id) && (!q || p.nome.toLowerCase().includes(q) || p.player_id.includes(q)),
    )
  }, [disponiveis, filtro, jaVinculados])

  const alternar = (id: string) =>
    setSelecionados((prev) => {
      const novo = { ...prev }
      if (novo[id]) delete novo[id]
      else novo[id] = 'Principal'
      return novo
    })

  const vincular = async () => {
    onErro('')
    setEnviando(true)
    try {
      for (const [playerId, categoria] of Object.entries(selecionados)) {
        const nome = disponiveis?.find((p) => p.player_id === playerId)?.nome ?? null
        await perpetuosService.adicionarVturbPlayer(perpetuoId, { player_id: playerId, player_nome: nome, categoria })
      }
      setSelecionados({})
      await onMudou()
    } catch (e) {
      onErro(extrairErro(e))
    } finally {
      setEnviando(false)
    }
  }

  const qtd = Object.keys(selecionados).length

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <p style={{ ...rotuloGrupo, margin: 0 }}>Vincular VSLs da conta VTurb</p>
      <input
        type="text"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        placeholder="Filtrar por nome…"
        style={inputVsl}
      />
      <div style={listaRolavel}>
        {disponiveis === null ? (
          <p style={vazioLista}>Carregando VSLs da VTurb…</p>
        ) : filtrados.length === 0 ? (
          <p style={vazioLista}>Nenhuma VSL disponível.</p>
        ) : (
          filtrados.map((p) => (
            <LinhaDisponivel
              key={p.player_id}
              player={p}
              categoria={selecionados[p.player_id]}
              onAlternar={() => alternar(p.player_id)}
              onCategoria={(cat) => setSelecionados((prev) => ({ ...prev, [p.player_id]: cat }))}
            />
          ))
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{qtd} selecionada(s)</span>
        <button
          type="button"
          onClick={vincular}
          disabled={enviando || qtd === 0}
          style={{ ...botaoPrimarioVsl, opacity: qtd === 0 || enviando ? 0.6 : 1 }}
        >
          {enviando ? 'Vinculando…' : 'Vincular selecionadas'}
        </button>
      </div>
    </div>
  )
}

function LinhaDisponivel({
  player,
  categoria,
  onAlternar,
  onCategoria,
}: {
  player: VturbPlayerDisponivel
  categoria: CategoriaVsl | undefined
  onAlternar: () => void
  onCategoria: (cat: CategoriaVsl) => void
}) {
  const marcado = categoria !== undefined
  const detalhes = [
    `${formatNum(player.plays_30d)} plays em 30 dias`,
    `duração ${formatDuracao(player.duracao_seg)}`,
    player.pitch_seg ? `pitch ${formatDuracao(player.pitch_seg)}` : 'sem pitch cadastrado',
  ]
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '6px 8px',
        fontSize: 13,
        color: 'var(--text)',
        cursor: 'pointer',
        borderRadius: 4,
        background: marcado ? 'var(--border)' : 'transparent',
      }}
    >
      <input type="checkbox" checked={marcado} onChange={onAlternar} style={{ marginTop: 3 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontWeight: 500, wordBreak: 'break-word' }}>{player.nome}</p>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-faint)' }}>{detalhes.join(' · ')}</p>
        {categoria !== undefined && (
          <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.preventDefault()}>
            <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Categoria:</span>
            <SelectCategoria valor={categoria} onChange={onCategoria} />
          </div>
        )}
      </div>
    </label>
  )
}

function SelectCategoria({ valor, onChange }: { valor: CategoriaVsl; onChange: (cat: CategoriaVsl) => void }) {
  return (
    <select value={valor} onChange={(e) => onChange(e.target.value as CategoriaVsl)} style={selectVsl}>
      {CATEGORIAS_VSL.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  )
}

const listaRolavel: React.CSSProperties = {
  maxHeight: 320,
  overflowY: 'auto',
  border: '1px solid var(--border-strong)',
  borderRadius: 8,
  padding: 6,
  background: 'var(--surface-2)',
}

const vazioLista: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: 'var(--text-faint)',
  padding: 12,
  textAlign: 'center',
}

const botaoRemover: React.CSSProperties = {
  ...botaoSecundarioVsl,
  color: '#EF4444',
  padding: 0,
  width: 26,
  height: 26,
  fontSize: 16,
  lineHeight: 1,
}

function linhaVinculada(ocupado: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    padding: '8px 10px',
    fontSize: 12,
    color: 'var(--text)',
    opacity: ocupado ? 0.5 : 1,
  }
}
