import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { extrairErro } from '@/lib/erro'
import { luziService } from '@/services/luziService'
import type { MensagemLuzi } from '@/types'

const ROXO = '#7C6AF7'

const SUGESTOES = [
  'Quanto vendemos ontem?',
  'Top 10 criativos dos últimos 7 dias',
  'Relatório da semana por canal',
  'Taxa de upsell no mês',
]

interface LuziChatProps {
  perpetuoId: string
  nomePerpetuo: string
  /** Período filtrado no dashboard (YYYY-MM-DD) — contexto pra Luzi. */
  inicio?: string
  fim?: string
}

// ============================================================
// Componente principal: botão flutuante + painel que sobe
// ============================================================
export function LuziChat({ perpetuoId, nomePerpetuo, inicio, fim }: LuziChatProps) {
  const [aberto, setAberto] = useState(false)
  const conversa = useConversaLuzi(perpetuoId, inicio, fim)
  const telaPequena = useTelaPequena()

  useEffect(() => {
    if (!aberto) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [aberto])

  return (
    <>
      <style>{KEYFRAMES}</style>
      {aberto ? (
        <PainelLuzi
          nomePerpetuo={nomePerpetuo}
          conversa={conversa}
          telaPequena={telaPequena}
          onFechar={() => setAberto(false)}
        />
      ) : (
        <BotaoFlutuante onClick={() => setAberto(true)} />
      )}
    </>
  )
}

// ============================================================
// Estado da conversa (histórico fica só no navegador)
// ============================================================
type ConversaLuzi = ReturnType<typeof useConversaLuzi>

function useConversaLuzi(perpetuoId: string, inicio?: string, fim?: string) {
  const [mensagens, setMensagens] = useState<MensagemLuzi[]>([])
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const pedirResposta = useCallback(
    async (historico: MensagemLuzi[]) => {
      setEnviando(true)
      setErro('')
      try {
        // O servidor recebe só as últimas 30 mensagens; a tela mantém tudo.
        const resposta = await luziService.conversar(perpetuoId, {
          mensagens: historico.slice(-30),
          inicio,
          fim,
        })
        setMensagens((anteriores) => [...anteriores, { papel: 'luzi', conteudo: resposta }])
      } catch (e) {
        setErro(extrairErro(e))
      } finally {
        setEnviando(false)
      }
    },
    [perpetuoId, inicio, fim],
  )

  const enviar = (texto: string) => {
    const limpo = texto.trim()
    if (!limpo || enviando) return
    const historico: MensagemLuzi[] = [...mensagens, { papel: 'usuario', conteudo: limpo }]
    setMensagens(historico)
    void pedirResposta(historico)
  }

  const tentarDeNovo = () => {
    if (!enviando) void pedirResposta(mensagens)
  }

  const limpar = () => {
    setMensagens([])
    setErro('')
  }

  return { mensagens, enviando, erro, enviar, tentarDeNovo, limpar }
}

function useTelaPequena() {
  const consulta = '(max-width: 640px)'
  const [pequena, setPequena] = useState(() => window.matchMedia(consulta).matches)
  useEffect(() => {
    const mq = window.matchMedia(consulta)
    const handler = (e: MediaQueryListEvent) => setPequena(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return pequena
}

// ============================================================
// Botão flutuante
// ============================================================
function BotaoFlutuante({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      title="Pergunte à Luzi sobre as vendas"
      style={{
        position: 'fixed',
        right: 24,
        bottom: 24,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '12px 18px 12px 14px',
        borderRadius: 999,
        border: 'none',
        background: ROXO,
        color: '#fff',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
        boxShadow: '0 8px 24px rgba(124,106,247,0.45)',
        animation: 'luziSobe 0.25s ease-out',
      }}
    >
      <IconeLuzi tamanho={20} />
      Pergunte à Luzi
    </button>
  )
}

// ============================================================
// Painel do chat
// ============================================================
function PainelLuzi({
  nomePerpetuo,
  conversa,
  telaPequena,
  onFechar,
}: {
  nomePerpetuo: string
  conversa: ConversaLuzi
  telaPequena: boolean
  onFechar: () => void
}) {
  const posicao: CSSProperties = telaPequena
    ? { inset: 0, borderRadius: 0 }
    : { right: 24, bottom: 24, width: 420, height: 'min(640px, calc(100vh - 48px))', borderRadius: 16 }

  return (
    <div
      role="dialog"
      aria-label="Luzi, assistente de vendas"
      style={{
        position: 'fixed',
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: '0 20px 50px rgba(0,0,0,0.45)',
        overflow: 'hidden',
        animation: 'luziSobe 0.25s ease-out',
        ...posicao,
      }}
    >
      <CabecalhoLuzi
        nomePerpetuo={nomePerpetuo}
        podeLimpar={conversa.mensagens.length > 0 && !conversa.enviando}
        onLimpar={conversa.limpar}
        onFechar={onFechar}
      />
      <ListaMensagens conversa={conversa} />
      <CampoPergunta enviando={conversa.enviando} onEnviar={conversa.enviar} />
    </div>
  )
}

function CabecalhoLuzi({
  nomePerpetuo,
  podeLimpar,
  onLimpar,
  onFechar,
}: {
  nomePerpetuo: string
  podeLimpar: boolean
  onLimpar: () => void
  onFechar: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: ROXO, color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <IconeLuzi tamanho={18} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Luzi</div>
        <div style={{ fontSize: 11, color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          Vendas Hotmart · {nomePerpetuo}
        </div>
      </div>
      {podeLimpar && (
        <button onClick={onLimpar} style={botaoTexto} title="Começar uma nova conversa">
          Nova conversa
        </button>
      )}
      <button onClick={onFechar} aria-label="Fechar" style={{ ...botaoTexto, fontSize: 22, padding: '0 4px' }}>
        ×
      </button>
    </div>
  )
}

function ListaMensagens({ conversa }: { conversa: ConversaLuzi }) {
  const fimRef = useRef<HTMLDivElement>(null)
  const { mensagens, enviando, erro } = conversa

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [mensagens.length, enviando, erro])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {mensagens.length === 0 && <BoasVindas onEscolher={conversa.enviar} />}
      {mensagens.map((m, i) => (
        <BalaoMensagem key={i} mensagem={m} />
      ))}
      {enviando && <IndicadorAnalisando />}
      {erro && !enviando && <AvisoErro erro={erro} onTentarDeNovo={conversa.tentarDeNovo} />}
      <div ref={fimRef} />
    </div>
  )
}

function BoasVindas({ onEscolher }: { onEscolher: (texto: string) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...balaoLuzi, alignSelf: 'flex-start' }}>
        Oi! Eu sou a <strong>Luzi</strong>. Pergunte o que quiser sobre as vendas da Hotmart deste perpétuo:
        resultados por dia, oferta, canal, criativo, página, compradores, reembolsos…
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {SUGESTOES.map((s) => (
          <button key={s} onClick={() => onEscolher(s)} style={chipSugestao}>
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

function BalaoMensagem({ mensagem }: { mensagem: MensagemLuzi }) {
  if (mensagem.papel === 'usuario') {
    return <div style={balaoUsuario}>{mensagem.conteudo}</div>
  }
  return (
    <div style={{ ...balaoLuzi, alignSelf: 'stretch' }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTES_MARKDOWN}>
        {mensagem.conteudo}
      </ReactMarkdown>
    </div>
  )
}

function IndicadorAnalisando() {
  return (
    <div style={{ ...balaoLuzi, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
      <span style={{ display: 'flex', gap: 3 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: ROXO, animation: `luziPulsa 1s ${i * 0.15}s infinite ease-in-out` }} />
        ))}
      </span>
      Luzi está analisando as vendas…
    </div>
  )
}

function AvisoErro({ erro, onTentarDeNovo }: { erro: string; onTentarDeNovo: () => void }) {
  return (
    <div style={{ border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)', borderRadius: 10, padding: '10px 12px', fontSize: 13, color: 'var(--text-error)' }}>
      {erro}
      <button onClick={onTentarDeNovo} style={{ ...botaoTexto, display: 'block', marginTop: 6, padding: 0, color: ROXO }}>
        ↻ Tentar de novo
      </button>
    </div>
  )
}

function CampoPergunta({ enviando, onEnviar }: { enviando: boolean; onEnviar: (texto: string) => void }) {
  const [texto, setTexto] = useState('')
  const enviar = () => {
    if (!texto.trim() || enviando) return
    onEnviar(texto)
    setTexto('')
  }
  const aoTeclar = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviar()
    }
  }
  const podeEnviar = texto.trim().length > 0 && !enviando

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', padding: 12, borderTop: '1px solid var(--border)' }}>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={aoTeclar}
        placeholder="Pergunte sobre as vendas…"
        rows={1}
        maxLength={4000}
        autoFocus
        style={{ flex: 1, resize: 'none', maxHeight: 120, minHeight: 40, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border-strong)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, fontFamily: 'inherit', outline: 'none', fieldSizing: 'content' } as CSSProperties}
      />
      <button
        onClick={enviar}
        disabled={!podeEnviar}
        aria-label="Enviar"
        style={{ width: 40, height: 40, borderRadius: 10, border: 'none', background: ROXO, color: '#fff', fontSize: 18, cursor: podeEnviar ? 'pointer' : 'not-allowed', opacity: podeEnviar ? 1 : 0.4, flexShrink: 0 }}
      >
        ↑
      </button>
    </div>
  )
}

// ============================================================
// Ícone (brilho) e estilos
// ============================================================
function IconeLuzi({ tamanho }: { tamanho: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9z" />
      <path d="M19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z" opacity={0.7} />
    </svg>
  )
}

const KEYFRAMES = `
@keyframes luziSobe { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
@keyframes luziPulsa { 0%, 100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }
`

const botaoTexto: CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-faint)',
  cursor: 'pointer',
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1,
  padding: '4px 6px',
}

const balaoBase: CSSProperties = {
  maxWidth: '100%',
  padding: '10px 12px',
  borderRadius: 12,
  fontSize: 13,
  lineHeight: 1.5,
  overflowWrap: 'anywhere',
}

const balaoLuzi: CSSProperties = {
  ...balaoBase,
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  borderTopLeftRadius: 4,
}

const balaoUsuario: CSSProperties = {
  ...balaoBase,
  alignSelf: 'flex-end',
  maxWidth: '85%',
  background: ROXO,
  color: '#fff',
  borderTopRightRadius: 4,
  whiteSpace: 'pre-wrap',
}

const chipSugestao: CSSProperties = {
  background: 'transparent',
  border: `1px solid ${ROXO}`,
  color: 'var(--text-strong)',
  borderRadius: 999,
  padding: '6px 10px',
  fontSize: 12,
  cursor: 'pointer',
}

const celula: CSSProperties = {
  padding: '5px 8px',
  border: '1px solid var(--border)',
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

const COMPONENTES_MARKDOWN: Components = {
  p: ({ children }) => <p style={{ margin: '0 0 8px' }}>{children}</p>,
  ul: ({ children }) => <ul style={{ margin: '0 0 8px', paddingLeft: 18 }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ margin: '0 0 8px', paddingLeft: 18 }}>{children}</ol>,
  h1: ({ children }) => <h4 style={{ margin: '4px 0 8px', fontSize: 14 }}>{children}</h4>,
  h2: ({ children }) => <h4 style={{ margin: '4px 0 8px', fontSize: 14 }}>{children}</h4>,
  h3: ({ children }) => <h4 style={{ margin: '4px 0 8px', fontSize: 13 }}>{children}</h4>,
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '0 0 8px' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>{children}</table>
    </div>
  ),
  th: ({ children }) => <th style={{ ...celula, background: 'var(--surface)', fontWeight: 600 }}>{children}</th>,
  td: ({ children }) => <td style={celula}>{children}</td>,
  code: ({ children }) => (
    <code style={{ background: 'var(--surface)', padding: '1px 4px', borderRadius: 4, fontSize: 12 }}>{children}</code>
  ),
}
