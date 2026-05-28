import { format, subDays } from 'date-fns'
import { useEffect, useMemo, useState } from 'react'

import { FiltroData } from '@/components/shared/FiltroData'
import { GraficoReceitaDia } from '@/components/shared/GraficoReceitaDia'
import { KPICard } from '@/components/shared/KPICard'
import { Modal } from '@/components/shared/Modal'
import { formatBRL, formatBRLPreciso, formatNum } from '@/lib/tokens'
import { vendasService, type FiltroVendas } from '@/services/vendasService'
import type {
  OfertaBreakdown,
  PontoReceita,
  ProdutoRanking,
  ResumoVendas,
} from '@/types'

const OFERTAS = ['Principal', 'Order Bump', 'Upsell', 'Downsell']

export function Vendas() {
  const hoje = format(new Date(), 'yyyy-MM-dd')
  const [inicio, setInicio] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'))
  const [fim, setFim] = useState(hoje)
  const [produto, setProduto] = useState<string>('')
  const [oferta, setOferta] = useState<string>('')

  const [resumo, setResumo] = useState<ResumoVendas | null>(null)
  const [porDia, setPorDia] = useState<PontoReceita[]>([])
  const [ranking, setRanking] = useState<ProdutoRanking[]>([])
  const [produtos, setProdutos] = useState<string[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  // Modal de ofertas de um produto (popup do ranking)
  const [produtoModal, setProdutoModal] = useState<string | null>(null)
  const [ofertas, setOfertas] = useState<OfertaBreakdown[]>([])
  const [ofertasCarregando, setOfertasCarregando] = useState(false)

  const abrirOfertas = (nomeProduto: string) => {
    setProdutoModal(nomeProduto)
    setOfertas([])
    setOfertasCarregando(true)
    vendasService
      .ofertasPorProduto(nomeProduto, inicio, fim)
      .then(setOfertas)
      .catch(() => setOfertas([]))
      .finally(() => setOfertasCarregando(false))
  }

  const filtro: FiltroVendas = useMemo(
    () => ({ inicio, fim, produto: produto || null, oferta: oferta || null }),
    [inicio, fim, produto, oferta],
  )

  // Carrega a lista de produtos uma vez (alimenta o dropdown)
  useEffect(() => {
    vendasService.produtos().then(setProdutos).catch(() => setProdutos([]))
  }, [])

  // Refetch dos agregados sempre que o filtro muda
  useEffect(() => {
    setCarregando(true)
    setErro('')
    Promise.all([
      vendasService.resumo(filtro),
      vendasService.porDia(filtro),
      vendasService.porProduto(filtro),
    ])
      .then(([r, d, p]) => {
        setResumo(r)
        setPorDia(d)
        setRanking(p)
      })
      .catch((e) => setErro(extrairErro(e)))
      .finally(() => setCarregando(false))
  }, [filtro])

  const porDiaFormatado = useMemo(
    () =>
      porDia.map((p) => ({
        data: p.data.slice(8, 10) + '/' + p.data.slice(5, 7),
        receita: p.receita,
      })),
    [porDia],
  )

  const maxRanking = ranking[0]?.receita ?? 1

  return (
    <div>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#F9FAFB' }}>
          Dashboard de Vendas
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
          Painel unificado de Hotmart, PagMe e PagTrust
        </p>
      </header>

      <div
        style={{
          background: '#111827',
          border: '1px solid #1F2937',
          borderRadius: 12,
          padding: '1rem 1.25rem',
          marginBottom: '1.25rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'flex-end',
        }}
      >
        <FiltroData
          inicioInicial={inicio}
          fimInicial={fim}
          onChange={(i, f) => {
            setInicio(i)
            setFim(f)
          }}
        />
        <Dropdown
          label="Produto"
          valor={produto}
          onChange={setProduto}
          opcoes={produtos}
          placeholder="Todos os produtos"
        />
        <Dropdown
          label="Oferta"
          valor={oferta}
          onChange={setOferta}
          opcoes={OFERTAS}
          placeholder="Todas as ofertas"
        />
      </div>

      {erro && (
        <div
          style={{
            background: '#EF444411',
            border: '1px solid #EF444444',
            borderRadius: 12,
            padding: '1rem 1.25rem',
            color: '#FCA5A5',
            fontSize: 13,
            marginBottom: '1.25rem',
          }}
        >
          Erro ao carregar vendas: {erro}
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
          marginBottom: '1.5rem',
          opacity: carregando ? 0.5 : 1,
          transition: 'opacity 0.15s',
        }}
      >
        <KPICard
          label="Receita total"
          valor={resumo ? formatBRL(resumo.receita_total) : '—'}
        />
        <KPICard
          label="Nº de vendas"
          valor={resumo ? formatNum(resumo.quantidade) : '—'}
          cor="#3ECFB2"
        />
        <KPICard
          label="Ticket médio"
          valor={resumo ? formatBRLPreciso(resumo.ticket_medio) : '—'}
          cor="#F59E0B"
        />
      </div>

      <div style={{ marginBottom: '1.5rem', opacity: carregando ? 0.5 : 1 }}>
        {porDiaFormatado.length > 0 ? (
          <GraficoReceitaDia dados={porDiaFormatado} />
        ) : (
          <CardVazio titulo="Receita por dia" mensagem="Sem vendas no período selecionado." />
        )}
      </div>

      <div
        style={{
          background: '#111827',
          border: '1px solid #1F2937',
          borderRadius: 12,
          padding: '1.25rem',
          opacity: carregando ? 0.5 : 1,
        }}
      >
        <p style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#E5E7EB' }}>
          Ranking por produto
        </p>
        {ranking.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
            Nenhuma venda encontrada para os filtros selecionados.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {ranking.map((r, i) => (
              <button
                key={r.produto}
                onClick={() => abrirOfertas(r.produto)}
                title="Ver ofertas deste produto"
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  padding: '6px 8px',
                  margin: '0 -8px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#1F2937'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 5,
                  }}
                >
                  <span style={{ fontSize: 13, color: '#E5E7EB', fontWeight: 500 }}>
                    <span style={{ color: '#6B7280', marginRight: 8 }}>#{i + 1}</span>
                    {r.produto}
                  </span>
                  <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#6B7280' }}>
                      {formatNum(r.quantidade)} vendas
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#F9FAFB',
                        minWidth: 100,
                        textAlign: 'right',
                      }}
                    >
                      {formatBRL(r.receita)}
                    </span>
                    <span style={{ fontSize: 14, color: '#4B5563' }}>›</span>
                  </div>
                </div>
                <div style={{ height: 6, background: '#1F2937', borderRadius: 99 }}>
                  <div
                    style={{
                      height: 6,
                      width: `${Math.round((r.receita / maxRanking) * 100)}%`,
                      background: '#7C6AF7',
                      borderRadius: 99,
                    }}
                  />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <Modal
        aberto={produtoModal !== null}
        titulo={produtoModal ? `Ofertas — ${produtoModal}` : 'Ofertas'}
        onFechar={() => setProdutoModal(null)}
        largura={640}
      >
        <ModalOfertas
          carregando={ofertasCarregando}
          ofertas={ofertas}
          onSalvou={() => produtoModal && abrirOfertas(produtoModal)}
        />
      </Modal>
    </div>
  )
}

function ModalOfertas({
  carregando,
  ofertas,
  onSalvou,
}: {
  carregando: boolean
  ofertas: OfertaBreakdown[]
  onSalvou: () => void
}) {
  if (carregando) {
    return <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>Carregando ofertas…</p>
  }
  if (ofertas.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
        Nenhuma oferta encontrada no período.
      </p>
    )
  }

  const totalReceita = ofertas.reduce((acc, o) => acc + o.receita, 0)
  const totalQtd = ofertas.reduce((acc, o) => acc + o.quantidade, 0)

  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: '#6B7280' }}>
        Clique no lápis pra ajustar o valor da oferta (ex: boleto parcelado, onde
        a plataforma só manda a parcela). O valor cadastrado vale pra todas as
        vendas dessa oferta.
      </p>

      <div style={{ display: 'grid', gap: 10 }}>
        {ofertas.map((o, i) => (
          <LinhaOferta
            key={o.oferta_codigo ?? `sem-codigo-${i}`}
            oferta={o}
            onSalvou={onSalvou}
          />
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 12,
          paddingTop: 10,
          borderTop: '1px solid #1F2937',
          fontSize: 13,
          fontWeight: 700,
          color: '#F9FAFB',
        }}
      >
        <span>Total ({formatNum(totalQtd)} vendas)</span>
        <span>{formatBRL(totalReceita)}</span>
      </div>
    </div>
  )
}

function LinhaOferta({
  oferta: o,
  onSalvou,
}: {
  oferta: OfertaBreakdown
  onSalvou: () => void
}) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(String(o.valor_oferta))
  const [salvando, setSalvando] = useState(false)

  const salvar = async () => {
    const num = Number(valor)
    if (!o.oferta_codigo || Number.isNaN(num) || num <= 0) return
    setSalvando(true)
    try {
      await vendasService.definirPrecoOferta(o.oferta_codigo, o.oferta_nome, num)
      setEditando(false)
      onSalvou()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 16,
        paddingBottom: 10,
        borderBottom: '1px solid #161E2E',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ margin: 0, fontSize: 13, color: '#F9FAFB', fontWeight: 500 }}>
          {o.oferta_nome ?? 'Sem nome'}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3 }}>
          <span style={{ fontSize: 11, color: '#6B7280', fontFamily: 'monospace' }}>
            {o.oferta_codigo ?? '—'}
          </span>
          {editando ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#6B7280' }}>R$</span>
              <input
                type="number"
                step="0.01"
                value={valor}
                autoFocus
                onChange={(e) => setValor(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') salvar()
                  if (e.key === 'Escape') setEditando(false)
                }}
                style={{
                  width: 90,
                  background: '#0F172A',
                  border: '1px solid #374151',
                  borderRadius: 6,
                  padding: '3px 8px',
                  color: '#F9FAFB',
                  fontSize: 12,
                }}
              />
              <button
                onClick={salvar}
                disabled={salvando}
                style={{
                  background: '#3ECFB2',
                  border: 'none',
                  color: '#0B0F19',
                  borderRadius: 6,
                  padding: '3px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {salvando ? '...' : 'Salvar'}
              </button>
              <button
                onClick={() => setEditando(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#6B7280',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: '#9CA3AF' }}>
                {formatBRLPreciso(o.valor_oferta)}
              </span>
              {o.valor_override != null && (
                <span
                  style={{
                    fontSize: 9,
                    color: '#3ECFB2',
                    background: '#3ECFB222',
                    padding: '1px 6px',
                    borderRadius: 99,
                    fontWeight: 600,
                  }}
                  title="Valor cadastrado manualmente"
                >
                  FIXADO
                </span>
              )}
              {o.oferta_codigo && (
                <button
                  onClick={() => {
                    setValor(String(o.valor_oferta))
                    setEditando(true)
                  }}
                  title="Editar valor da oferta"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#6B7280',
                    cursor: 'pointer',
                    fontSize: 12,
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  ✎
                </button>
              )}
            </span>
          )}
        </div>
      </div>
      <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
        <p style={{ margin: 0, fontSize: 13, color: '#F9FAFB', fontWeight: 600 }}>
          {formatBRL(o.receita)}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#6B7280' }}>
          {formatNum(o.quantidade)} {o.quantidade === 1 ? 'venda' : 'vendas'}
        </p>
      </div>
    </div>
  )
}

function Dropdown({
  label,
  valor,
  onChange,
  opcoes,
  placeholder,
}: {
  label: string
  valor: string
  onChange: (v: string) => void
  opcoes: string[]
  placeholder: string
}) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, color: '#6B7280', marginBottom: 6 }}>
        {label}
      </label>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: '#0F172A',
          border: '1px solid #374151',
          borderRadius: 8,
          padding: '8px 12px',
          color: '#F9FAFB',
          fontSize: 13,
          minWidth: 180,
          colorScheme: 'dark',
        }}
      >
        <option value="">{placeholder}</option>
        {opcoes.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
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
        padding: '1.25rem',
        minHeight: 200,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <p style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: '#E5E7EB' }}>
        {titulo}
      </p>
      <div
        style={{
          flex: 1,
          display: 'grid',
          placeItems: 'center',
          color: '#6B7280',
          fontSize: 13,
          textAlign: 'center',
        }}
      >
        {mensagem}
      </div>
    </div>
  )
}

function extrairErro(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const resp = (err as { response?: { data?: { detail?: string } } }).response
    if (resp?.data?.detail) return resp.data.detail
  }
  if (err instanceof Error) return err.message
  return 'Erro desconhecido'
}
