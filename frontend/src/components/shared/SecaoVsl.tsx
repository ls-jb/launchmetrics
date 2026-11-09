import { useCallback, useEffect, useRef, useState } from 'react'

import { extrairErro } from '@/lib/erro'
import {
  formatBRL,
  formatBRLPreciso,
  formatDuracao,
  formatNum,
  formatTaxa,
} from '@/lib/tokens'
import { perpetuosService } from '@/services/perpetuosService'
import type { CategoriaVsl, VslCurva, VslKpis, VslLinhaPlayer, VslPainel } from '@/types'

import { FormVturbPlayers } from './FormVturbPlayers'
import { GraficoRetencaoVsl } from './GraficoRetencaoVsl'
import { GraficoVslDia } from './GraficoVslDia'
import { KPICard } from './KPICard'
import { Modal } from './Modal'
import {
  COR_CATEGORIA_VSL,
  avisoErro,
  botaoPrimarioVsl,
  botaoSecundarioVsl,
  cartao,
  gradeKpis,
  pilulaCategoria,
  rotuloGrupo,
  textoMudoVsl,
  tituloSecaoVsl,
} from './vslEstilos'

/** Seção "VSLs (VTurb)" do detalhe do perpétuo: métricas das VSLs da
 * categoria escolhida no mesmo período do resto da tela. Todos os números
 * (inclusive taxas e cruzamento com vendas reais) vêm prontos do backend. */
export function SecaoVsl({
  perpetuoId,
  inicio,
  fim,
  isAdmin,
  recarga,
}: {
  perpetuoId: string
  inicio?: string
  fim?: string
  isAdmin: boolean
  /** Muda quando a página recarrega (botão Atualizar, novo aporte…). */
  recarga?: unknown
}) {
  const [categoria, setCategoria] = useState<CategoriaVsl | undefined>(undefined)
  const [painel, setPainel] = useState<VslPainel | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [modalAberto, setModalAberto] = useState(false)
  // VSL que o usuário clicou na tabela. Sem clique (ou se ela não está na
  // lista atual), a curva mostra a VSL com mais plays no período.
  const [escolhido, setEscolhido] = useState<string | null>(null)
  const ultimaRef = useRef(0)

  const carregar = useCallback(async () => {
    const requisicao = ++ultimaRef.current
    setCarregando(true)
    setErro('')
    try {
      const p = await perpetuosService.painelVsl(perpetuoId, categoria, inicio, fim)
      if (requisicao !== ultimaRef.current) return
      setPainel(p)
    } catch (e) {
      if (requisicao === ultimaRef.current) setErro(extrairErro(e))
    } finally {
      if (requisicao === ultimaRef.current) setCarregando(false)
    }
  }, [perpetuoId, categoria, inicio, fim])

  useEffect(() => {
    carregar()
  }, [carregar, recarga])

  const ativa = painel?.categoria ?? categoria
  const cor = ativa ? COR_CATEGORIA_VSL[ativa] : COR_CATEGORIA_VSL.Principal
  const players = painel?.players ?? []
  const selecionado = players.some((l) => l.player_id === escolhido)
    ? escolhido
    : (players[0]?.player_id ?? null) // já vem ordenada por plays

  return (
    <section style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <h3 style={tituloSecaoVsl}>VSLs (VTurb)</h3>
        {painel?.categorias_disponiveis.map((c) => (
          <button key={c} type="button" onClick={() => setCategoria(c)} style={pilulaCategoria(COR_CATEGORIA_VSL[c], c === ativa)}>
            {c}
          </button>
        ))}
        {carregando && painel && <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Atualizando…</span>}
        {isAdmin && painel?.configurado && (
          <button type="button" onClick={() => setModalAberto(true)} style={{ ...botaoSecundarioVsl, marginLeft: 'auto' }}>
            Gerenciar VSLs
          </button>
        )}
      </div>

      {erro && (
        <div style={{ ...avisoErro, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1 }}>{erro}</span>
          <button type="button" onClick={carregar} style={botaoSecundarioVsl}>
            Tentar de novo
          </button>
        </div>
      )}

      <ConteudoVsl
        painel={painel}
        carregando={carregando}
        isAdmin={isAdmin}
        cor={cor}
        perpetuoId={perpetuoId}
        inicio={inicio}
        fim={fim}
        selecionado={selecionado}
        onSelecionar={setEscolhido}
        onVincular={() => setModalAberto(true)}
      />

      <Modal aberto={modalAberto} titulo="VSLs do perpétuo (VTurb)" onFechar={() => setModalAberto(false)} largura={640}>
        <FormVturbPlayers perpetuoId={perpetuoId} vinculos={painel?.vinculos ?? []} onMudou={carregar} />
      </Modal>
    </section>
  )
}

function ConteudoVsl({
  painel,
  carregando,
  isAdmin,
  cor,
  perpetuoId,
  inicio,
  fim,
  selecionado,
  onSelecionar,
  onVincular,
}: {
  painel: VslPainel | null
  carregando: boolean
  isAdmin: boolean
  cor: string
  perpetuoId: string
  inicio?: string
  fim?: string
  selecionado: string | null
  onSelecionar: (playerId: string) => void
  onVincular: () => void
}) {
  if (!painel) {
    return carregando ? (
      <p style={textoMudoVsl}>Carregando métricas da VTurb… (a primeira consulta pode levar alguns segundos)</p>
    ) : null
  }
  if (!painel.configurado) {
    return <CardAviso titulo="VTurb não configurada" mensagem="Falta a chave VTURB_API_TOKEN no backend." />
  }
  if (painel.vinculos.length === 0 || !painel.kpis || !painel.categoria) {
    return (
      <CardAviso titulo="Nenhuma VSL vinculada" mensagem="Vincule as VSLs da VTurb (principal, upsell, downsell) para ver as métricas aqui.">
        {isAdmin && (
          <button type="button" onClick={onVincular} style={{ ...botaoPrimarioVsl, marginTop: 14 }}>
            Vincular VSLs
          </button>
        )}
      </CardAviso>
    )
  }
  const linhaSelecionada = painel.players.find((l) => l.player_id === selecionado) ?? null
  return (
    <div style={{ display: 'grid', gap: 16, opacity: carregando ? 0.6 : 1, transition: 'opacity 0.2s' }}>
      <KpisVsl kpis={painel.kpis} categoria={painel.categoria} />
      <div>
        <p style={rotuloGrupo}>Por dia</p>
        <GraficoVslDia dias={painel.dias} cor={cor} />
      </div>
      <TabelaVsls players={painel.players} selecionado={selecionado} onSelecionar={onSelecionar} cor={cor} />
      {linhaSelecionada && (
        <CurvaVsl perpetuoId={perpetuoId} linha={linhaSelecionada} inicio={inicio} fim={fim} cor={cor} />
      )}
    </div>
  )
}

// ============================================================
// KPIs
// ============================================================
const brl = (v: number | null) => (v === null ? '—' : formatBRLPreciso(v))

function KpisVsl({ kpis: k, categoria }: { kpis: VslKpis; categoria: CategoriaVsl }) {
  const pitchSub =
    k.audiencia_pitch !== null ? `${formatNum(k.audiencia_pitch)} pessoas chegaram ao pitch` : 'pitch não cadastrado na VTurb'
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div>
        <p style={rotuloGrupo}>Funil do vídeo</p>
        <div style={gradeKpis}>
          <KPICard label="Views únicas" valor={formatNum(k.views_unicas)} sub={`${formatNum(k.views)} no total`} />
          <KPICard label="Plays únicos" valor={formatNum(k.plays_unicos)} sub={`${formatNum(k.plays)} no total`} />
          <KPICard label="Play rate" valor={formatTaxa(k.play_rate)} sub="plays ÷ views únicas" />
          <KPICard label="Engajamento" valor={formatTaxa(k.engajamento)} sub="quanto do vídeo foi assistido" />
          <KPICard label="Tempo médio" valor={formatDuracao(k.tempo_medio_seg)} sub="assistido por play" />
          <KPICard label="Retenção no pitch" valor={formatTaxa(k.retencao_pitch)} sub={pitchSub} />
          <KPICard label="Finalizações" valor={formatNum(k.finalizacoes_unicas)} sub={`${formatTaxa(k.taxa_finalizacao)} dos plays`} />
          <KPICard label="Cliques no botão" valor={formatNum(k.cliques_unicos)} sub={`${formatTaxa(k.taxa_clique)} dos plays`} />
        </div>
      </div>
      <div>
        <p style={rotuloGrupo}>Resultado — vendas reais ({categoria})</p>
        <div style={gradeKpis}>
          <KPICard label={`Vendas ${categoria}`} valor={formatNum(k.vendas_reais ?? 0)} sub={formatBRL(k.receita_real ?? 0)} />
          <KPICard label="Conversão real" valor={formatTaxa(k.conversao_real, 2)} sub="vendas ÷ plays únicos" />
          <KPICard label="Receita por play" valor={brl(k.receita_por_play)} sub="receita bruta ÷ plays únicos" />
          {categoria === 'Principal' && (
            <KPICard
              label="Custo por play"
              valor={brl(k.custo_por_play)}
              sub={`por view ${brl(k.custo_por_view)} · invest. sem impostos`}
            />
          )}
          <KPICard
            label="Conversões (pixel VTurb)"
            valor={formatNum(k.conversoes_vturb)}
            sub={`${formatBRL(k.receita_vturb)} · ${formatTaxa(k.conversao_vturb, 2)} — atribuição, não é venda`}
          />
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Tabela comparativa
// ============================================================
const COLUNAS = 'minmax(200px, 2.2fr) repeat(8, minmax(78px, 1fr))'

function TabelaVsls({
  players,
  selecionado,
  onSelecionar,
  cor,
}: {
  players: VslLinhaPlayer[]
  selecionado: string | null
  onSelecionar: (playerId: string) => void
  cor: string
}) {
  const cabecalho = ['VSL', 'Views', 'Plays', 'Play rate', 'Engaj.', 'Tempo médio', 'Ret. pitch', 'Cliques', 'Conv. pixel']
  return (
    <div>
      <p style={rotuloGrupo}>Comparar VSLs — clique numa linha para ver a curva de retenção</p>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 900, display: 'grid', gap: 4 }}>
          <div style={{ ...linhaTabela, background: 'transparent', border: 'none', color: 'var(--text-faint)', fontWeight: 600 }}>
            {cabecalho.map((c, i) => (
              <span key={c} style={i === 0 ? undefined : celulaNumero}>
                {c}
              </span>
            ))}
          </div>
          {players.map((l) => {
            const ativo = l.player_id === selecionado
            const k = l.kpis
            return (
              <button
                key={l.player_id}
                type="button"
                onClick={() => onSelecionar(l.player_id)}
                style={{ ...linhaTabela, cursor: 'pointer', textAlign: 'left', borderColor: ativo ? cor : 'var(--border)' }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }} title={l.nome}>
                  {l.nome}
                </span>
                <span style={celulaNumero}>{formatNum(k.views_unicas)}</span>
                <span style={celulaNumero}>{formatNum(k.plays_unicos)}</span>
                <span style={celulaNumero}>{formatTaxa(k.play_rate)}</span>
                <span style={celulaNumero}>{formatTaxa(k.engajamento)}</span>
                <span style={celulaNumero}>{formatDuracao(k.tempo_medio_seg)}</span>
                <span style={celulaNumero}>{formatTaxa(k.retencao_pitch)}</span>
                <span style={celulaNumero}>
                  {formatNum(k.cliques_unicos)} <small style={{ color: 'var(--text-faint)' }}>{formatTaxa(k.taxa_clique)}</small>
                </span>
                <span style={celulaNumero}>
                  {formatNum(k.conversoes_vturb)} <small style={{ color: 'var(--text-faint)' }}>{formatTaxa(k.conversao_vturb, 2)}</small>
                </span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Curva de retenção da VSL selecionada
// ============================================================
function CurvaVsl({
  perpetuoId,
  linha,
  inicio,
  fim,
  cor,
}: {
  perpetuoId: string
  linha: VslLinhaPlayer
  inicio?: string
  fim?: string
  cor: string
}) {
  const [curva, setCurva] = useState<VslCurva | null>(null)
  const [erro, setErro] = useState('')
  const playerId = linha.player_id

  useEffect(() => {
    let ativo = true
    setErro('')
    perpetuosService
      .curvaVsl(perpetuoId, playerId, inicio, fim)
      .then((c) => ativo && setCurva(c))
      .catch((e) => ativo && setErro(extrairErro(e)))
    return () => {
      ativo = false
    }
  }, [perpetuoId, playerId, inicio, fim])

  const atual = curva?.player_id === playerId ? curva : null
  const resumo = [
    `duração ${formatDuracao(linha.duracao_seg)}`,
    linha.pitch_seg ? `pitch em ${formatDuracao(linha.pitch_seg)}` : 'sem pitch cadastrado',
    `tempo médio ${formatDuracao(linha.kpis.tempo_medio_seg)}`,
    `engajamento ${formatTaxa(linha.kpis.engajamento)}`,
  ]

  return (
    <div style={cartao}>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>Retenção — {linha.nome}</p>
      <p style={{ margin: '4px 0 12px', fontSize: 12, color: 'var(--text-faint)' }}>{resumo.join(' · ')}</p>
      {erro ? (
        <div style={avisoErro}>{erro}</div>
      ) : atual && curvaVazia(atual) ? (
        <p style={{ ...textoMudoVsl, margin: 0 }}>Sem plays dessa VSL no período selecionado.</p>
      ) : atual ? (
        <GraficoRetencaoVsl curva={atual} cor={cor} />
      ) : (
        <p style={textoMudoVsl}>Carregando curva…</p>
      )}
    </div>
  )
}

/** Ninguém assistiu nem clicou/converteu no período. */
function curvaVazia(curva: VslCurva) {
  return curva.pontos.every((p) => p.usuarios === null && !p.cliques && !p.conversoes)
}

function CardAviso({
  titulo,
  mensagem,
  children,
}: {
  titulo: string
  mensagem: string
  children?: React.ReactNode
}) {
  return (
    <div style={{ ...cartao, border: '1px dashed var(--border-strong)', textAlign: 'center', padding: '2rem 1.5rem' }}>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>{titulo}</p>
      <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>{mensagem}</p>
      {children}
    </div>
  )
}

const linhaTabela: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: COLUNAS,
  gap: 8,
  alignItems: 'center',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '9px 12px',
  fontSize: 12,
  color: 'var(--text)',
  width: '100%',
}

const celulaNumero: React.CSSProperties = {
  textAlign: 'right',
  fontVariantNumeric: 'tabular-nums',
}
