import { useCallback, useEffect, useMemo, useState } from 'react'

import { Modal } from '@/components/shared/Modal'
import { formatBRL, formatNum } from '@/lib/tokens'
import { placarService } from '@/services/placarService'
import type {
  PlacarCompleto,
  PlacarLancamento,
  PlacarOferta,
  PlacarVendedor,
} from '@/types'

const MEDALHA = ['🥇', '🥈', '🥉']

export function Placar() {
  const [lancamentos, setLancamentos] = useState<PlacarLancamento[]>([])
  const [lancId, setLancId] = useState<string | null>(null)
  const [placar, setPlacar] = useState<PlacarCompleto | null>(null)
  const [carregandoLista, setCarregandoLista] = useState(true)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [vendedorModal, setVendedorModal] = useState<PlacarVendedor | null>(null)

  const recarregarLista = useCallback(() => {
    setCarregandoLista(true)
    setErro('')
    placarService
      .listarLancamentos()
      .then(setLancamentos)
      .catch((e) => setErro(extrairErro(e)))
      .finally(() => setCarregandoLista(false))
  }, [])

  useEffect(() => {
    recarregarLista()
  }, [recarregarLista])

  // carrega o placar do lançamento escolhido (só quando um está selecionado)
  const carregar = useCallback(
    async (silencioso = false) => {
      if (!lancId) return
      if (!silencioso) setCarregando(true)
      try {
        const p = await placarService.obter(lancId)
        setPlacar(p)
      } catch (e) {
        if (!silencioso) setErro(extrairErro(e))
      } finally {
        if (!silencioso) setCarregando(false)
      }
    },
    [lancId],
  )

  useEffect(() => {
    carregar(false)
  }, [carregar])

  // auto-refresh só faz sentido dentro de um lançamento aberto
  useEffect(() => {
    if (!lancId) return
    const id = setInterval(() => carregar(true), 30_000)
    return () => clearInterval(id)
  }, [carregar, lancId])

  const contagemMap = useMemo(() => {
    const m = new Map<string, number>()
    placar?.contagens.forEach((c) =>
      m.set(`${c.vendedor_id}|${c.oferta_id}`, c.quantidade),
    )
    return m
  }, [placar])

  const qtyDe = (vendedorId: string, ofertaId: string) =>
    contagemMap.get(`${vendedorId}|${ofertaId}`) ?? 0

  const marcar = async (vendedor: PlacarVendedor, oferta: PlacarOferta, delta: 1 | -1) => {
    const atual = qtyDe(vendedor.id, oferta.id)
    if (delta === -1 && atual <= 0) return
    setPlacar((p) => (p ? aplicarDelta(p, vendedor.id, oferta, delta) : p))
    try {
      await placarService.marcar(vendedor.id, oferta.id, delta)
    } catch {
      carregar(true)
    }
  }

  const abrirLancamento = (l: PlacarLancamento) => {
    setLancId(l.id)
    setPlacar(null)
    setErro('')
  }

  const voltar = () => {
    setLancId(null)
    setPlacar(null)
    setErro('')
    recarregarLista()
  }

  // ============================================================
  // TELA 1 — lista de lançamentos
  // ============================================================
  if (!lancId) {
    return (
      <div>
        <header style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#F9FAFB' }}>
            Placar de Líderes
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
            Escolha o lançamento para ver o ranking
          </p>
        </header>

        {erro && <Aviso texto={`Erro: ${erro}`} />}

        {!carregandoLista && lancamentos.length === 0 && (
          <CardVazio
            titulo="Nenhum lançamento no placar"
            mensagem="Peça a um administrador para criar um lançamento e cadastrar as ofertas e os vendedores em Configurações."
          />
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          {lancamentos.map((l) => (
            <button
              key={l.id}
              onClick={() => abrirLancamento(l)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                textAlign: 'left',
                background: '#111827',
                border: '1px solid #1F2937',
                borderRadius: 12,
                padding: '16px 18px',
                cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#7C6AF7')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1F2937')}
            >
              <span style={{ flex: 1, fontSize: 16, fontWeight: 600, color: '#F9FAFB' }}>
                {l.nome}
              </span>
              {l.ativo && (
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: '#3ECFB2',
                    background: '#3ECFB222',
                    padding: '3px 8px',
                    borderRadius: 99,
                  }}
                >
                  ATIVO
                </span>
              )}
              <span style={{ fontSize: 18, color: '#4B5563' }}>›</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  // ============================================================
  // TELA 2 — ranking de um lançamento
  // ============================================================
  const nomeLanc = placar?.lancamento.nome ?? lancamentos.find((l) => l.id === lancId)?.nome ?? ''

  return (
    <div>
      <button
        onClick={voltar}
        style={{
          background: 'transparent',
          border: 'none',
          color: '#9CA3AF',
          fontSize: 13,
          cursor: 'pointer',
          padding: 0,
          marginBottom: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        ‹ Voltar aos lançamentos
      </button>

      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#F9FAFB' }}>
          {nomeLanc}
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
          Clique no seu nome e marque cada venda que fechar
        </p>
      </header>

      {erro && <Aviso texto={`Erro: ${erro}`} />}

      {placar && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
            marginBottom: '1.5rem',
          }}
        >
          <CardTotal
            titulo="Vendas reais (plataformas)"
            qtd={placar.total_real.quantidade}
            receita={placar.total_real.receita}
            cor="#3ECFB2"
          />
          <CardTotal
            titulo="Marcado pelos closers"
            qtd={placar.total_closers.quantidade}
            receita={placar.total_closers.receita}
            cor="#7C6AF7"
          />
        </div>
      )}

      {placar && placar.vendedores.length === 0 ? (
        <CardVazio
          titulo="Sem vendedores"
          mensagem="Nenhum vendedor cadastrado neste lançamento ainda. Cadastre o time em Configurações."
        />
      ) : (
        placar && (
          <div style={{ display: 'grid', gap: 10, opacity: carregando ? 0.6 : 1 }}>
            {placar.ranking.map((r, i) => (
              <button
                key={r.vendedor_id}
                onClick={() => setVendedorModal({ id: r.vendedor_id, nome: r.nome })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                  width: '100%',
                  textAlign: 'left',
                  background: '#111827',
                  border: '1px solid #1F2937',
                  borderRadius: 12,
                  padding: '14px 16px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#7C6AF7')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1F2937')}
              >
                <span
                  style={{
                    fontSize: 18,
                    width: 32,
                    textAlign: 'center',
                    color: '#6B7280',
                    fontWeight: 700,
                  }}
                >
                  {MEDALHA[i] ?? `${i + 1}º`}
                </span>
                <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: '#F9FAFB' }}>
                  {r.nome}
                </span>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#3ECFB2' }}>
                    {formatBRL(r.receita_total)}
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6B7280' }}>
                    {formatNum(r.quantidade_total)}{' '}
                    {r.quantidade_total === 1 ? 'venda' : 'vendas'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )
      )}

      <Modal
        aberto={vendedorModal !== null}
        titulo={vendedorModal ? `Marcar vendas — ${vendedorModal.nome}` : ''}
        onFechar={() => setVendedorModal(null)}
        largura={620}
      >
        {vendedorModal && placar && (
          <MarcacaoVendedor
            vendedor={vendedorModal}
            ofertas={placar.ofertas}
            qtyDe={qtyDe}
            onMarcar={marcar}
          />
        )}
      </Modal>
    </div>
  )
}

function MarcacaoVendedor({
  vendedor,
  ofertas,
  qtyDe,
  onMarcar,
}: {
  vendedor: PlacarVendedor
  ofertas: PlacarOferta[]
  qtyDe: (v: string, o: string) => number
  onMarcar: (v: PlacarVendedor, o: PlacarOferta, delta: 1 | -1) => void
}) {
  if (ofertas.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
        Nenhuma oferta cadastrada neste lançamento. Cadastre as ofertas em
        Configurações.
      </p>
    )
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {ofertas.map((o) => {
        const q = qtyDe(vendedor.id, o.id)
        return (
          <div
            key={o.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 12px',
              background: '#0F172A',
              border: '1px solid #1F2937',
              borderRadius: 8,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13, color: '#F9FAFB', fontWeight: 500 }}>
                {o.produto}
                {o.oferta ? ` · ${o.oferta}` : ''}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6B7280' }}>
                {formatBRL(o.valor)}
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <BotaoContador
                texto="−"
                desabilitado={q <= 0}
                onClick={() => onMarcar(vendedor, o, -1)}
              />
              <span
                style={{
                  minWidth: 28,
                  textAlign: 'center',
                  fontSize: 16,
                  fontWeight: 700,
                  color: q > 0 ? '#F9FAFB' : '#4B5563',
                }}
              >
                {q}
              </span>
              <BotaoContador texto="+" onClick={() => onMarcar(vendedor, o, 1)} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function BotaoContador({
  texto,
  onClick,
  desabilitado,
}: {
  texto: string
  onClick: () => void
  desabilitado?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={desabilitado}
      style={{
        width: 34,
        height: 34,
        borderRadius: 8,
        border: '1px solid #374151',
        background: desabilitado ? 'transparent' : '#1F2937',
        color: desabilitado ? '#4B5563' : '#F9FAFB',
        fontSize: 20,
        fontWeight: 700,
        lineHeight: 1,
        cursor: desabilitado ? 'not-allowed' : 'pointer',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {texto}
    </button>
  )
}

function CardTotal({
  titulo,
  qtd,
  receita,
  cor,
}: {
  titulo: string
  qtd: number
  receita: number
  cor: string
}) {
  return (
    <div
      style={{
        background: '#111827',
        border: '1px solid #1F2937',
        borderRadius: 12,
        padding: '1rem 1.25rem',
      }}
    >
      <p
        style={{
          margin: '0 0 6px',
          fontSize: 11,
          color: '#6B7280',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {titulo}
      </p>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: cor }}>
        {formatBRL(receita)}
      </p>
      <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6B7280' }}>
        {formatNum(qtd)} {qtd === 1 ? 'venda' : 'vendas'}
      </p>
    </div>
  )
}

function CardVazio({ titulo, mensagem }: { titulo: string; mensagem: string }) {
  return (
    <div
      style={{
        background: '#111827',
        border: '1px dashed #374151',
        borderRadius: 12,
        padding: '2rem 1.5rem',
        textAlign: 'center',
      }}
    >
      <p style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600, color: '#E5E7EB' }}>
        {titulo}
      </p>
      <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>{mensagem}</p>
    </div>
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div
      style={{
        background: '#EF444411',
        border: '1px solid #EF444444',
        borderRadius: 12,
        padding: '0.85rem 1.1rem',
        color: '#FCA5A5',
        fontSize: 13,
        marginBottom: '1.25rem',
      }}
    >
      {texto}
    </div>
  )
}

// aplica +1/-1 numa contagem e recalcula o ranking (para resposta imediata)
function aplicarDelta(
  p: PlacarCompleto,
  vendedorId: string,
  oferta: PlacarOferta,
  delta: 1 | -1,
): PlacarCompleto {
  const chave = `${vendedorId}|${oferta.id}`
  let achou = false
  const contagens = p.contagens
    .map((c) => {
      if (`${c.vendedor_id}|${c.oferta_id}` === chave) {
        achou = true
        return { ...c, quantidade: Math.max(0, c.quantidade + delta) }
      }
      return c
    })
    .filter((c) => c.quantidade > 0)
  if (!achou && delta === 1) {
    contagens.push({ vendedor_id: vendedorId, oferta_id: oferta.id, quantidade: 1 })
  }

  const ranking = p.ranking
    .map((r) =>
      r.vendedor_id === vendedorId
        ? {
            ...r,
            quantidade_total: Math.max(0, r.quantidade_total + delta),
            receita_total: Math.max(0, r.receita_total + delta * oferta.valor),
          }
        : r,
    )
    .sort(
      (a, b) =>
        b.receita_total - a.receita_total ||
        b.quantidade_total - a.quantidade_total ||
        a.nome.localeCompare(b.nome),
    )

  return { ...p, contagens, ranking }
}

function extrairErro(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const resp = (err as { response?: { data?: { detail?: string } } }).response
    if (resp?.data?.detail) return resp.data.detail
  }
  if (err instanceof Error) return err.message
  return 'Erro desconhecido'
}
