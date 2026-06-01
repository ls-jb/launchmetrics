import { format, subDays } from 'date-fns'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { FiltroData } from '@/components/shared/FiltroData'
import { GraficoReceitaDia } from '@/components/shared/GraficoReceitaDia'
import { KPICard } from '@/components/shared/KPICard'
import { Modal } from '@/components/shared/Modal'
import { formatBRL, formatBRLPreciso, formatNum } from '@/lib/tokens'
import { vendasService, type FiltroVendas } from '@/services/vendasService'
import type {
  MetodoPagamento,
  OfertaBreakdown,
  PontoReceita,
  ProdutoRanking,
  ResumoVendas,
  Venda,
  VendaManualCreatePayload,
} from '@/types'

const OFERTAS = ['Principal', 'Order Bump', 'Upsell', 'Downsell']

export function Vendas() {
  const hoje = format(new Date(), 'yyyy-MM-dd')
  const [inicio, setInicio] = useState(format(subDays(new Date(), 29), 'yyyy-MM-dd'))
  const [fim, setFim] = useState(hoje)
  const [produtosSel, setProdutosSel] = useState<string[]>([])
  const [oferta, setOferta] = useState<string>('')

  const [resumo, setResumo] = useState<ResumoVendas | null>(null)
  const [porDia, setPorDia] = useState<PontoReceita[]>([])
  const [ranking, setRanking] = useState<ProdutoRanking[]>([])
  const [produtos, setProdutos] = useState<string[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  // refetch manual (após cadastrar venda)
  const [refreshKey, setRefreshKey] = useState(0)

  // Modal de ofertas de um produto (popup do ranking)
  const [produtoModal, setProdutoModal] = useState<string | null>(null)
  const [ofertas, setOfertas] = useState<OfertaBreakdown[]>([])
  const [ofertasCarregando, setOfertasCarregando] = useState(false)

  // Modal de cadastro de venda manual
  const [modalVenda, setModalVenda] = useState(false)
  // Modal de remoção de venda manual
  const [modalRemover, setModalRemover] = useState(false)

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
    () => ({ inicio, fim, produtos: produtosSel, oferta: oferta || null }),
    [inicio, fim, produtosSel, oferta],
  )

  // Carrega a lista de produtos uma vez (alimenta o dropdown)
  useEffect(() => {
    vendasService.produtos().then(setProdutos).catch(() => setProdutos([]))
  }, [])

  // Busca os agregados. silencioso=true → refresh em background (sem spinner
  // nem flash de erro), usado pelo auto-refresh de 30s pra não piscar a tela.
  const carregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) {
        setCarregando(true)
        setErro('')
      }
      try {
        const [r, d, p] = await Promise.all([
          vendasService.resumo(filtro),
          vendasService.porDia(filtro),
          vendasService.porProduto(filtro),
        ])
        setResumo(r)
        setPorDia(d)
        setRanking(p)
      } catch (e) {
        if (!silencioso) setErro(extrairErro(e))
      } finally {
        if (!silencioso) setCarregando(false)
      }
    },
    [filtro],
  )

  // Carga inicial + quando muda filtro ou após cadastrar venda (com spinner)
  useEffect(() => {
    carregar(false)
  }, [carregar, refreshKey])

  // Auto-refresh: recarrega em background a cada 30s
  useEffect(() => {
    const id = setInterval(() => carregar(true), 30_000)
    return () => clearInterval(id)
  }, [carregar])

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
      <style>{`@keyframes lm-spin { to { transform: rotate(360deg) } }`}</style>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#F9FAFB' }}>
            Dashboard de Vendas
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
            Hotmart, Guru e vendas manuais (PIX, avulsas)
          </p>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 11,
              color: '#4B5563',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                background: '#3ECFB2',
                display: 'inline-block',
              }}
            />
            Atualiza automaticamente a cada 30s
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={() => carregar(false)}
            disabled={carregando}
            title="Atualizar agora"
            style={{
              background: 'transparent',
              border: '1px solid #374151',
              color: '#9CA3AF',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: carregando ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              opacity: carregando ? 0.6 : 1,
            }}
          >
            <IconeAtualizar girando={carregando} />
            {carregando ? 'Atualizando…' : 'Atualizar'}
          </button>
          <button
            onClick={() => setModalRemover(true)}
            title="Listar e remover vendas manuais do período"
            style={{
              background: 'transparent',
              border: '1px solid #374151',
              color: '#9CA3AF',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Remover venda
          </button>
          <button
            onClick={() => setModalVenda(true)}
            style={{
              background: '#7C6AF7',
              border: 'none',
              color: '#fff',
              padding: '10px 16px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Cadastrar venda
          </button>
        </div>
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
        <MultiSelect
          label="Produtos"
          selecionados={produtosSel}
          onChange={setProdutosSel}
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
          <div
            style={{
              display: 'grid',
              gap: 14,
              // a partir de 10 produtos, vira área rolável pra não esticar a página
              maxHeight: ranking.length > 10 ? 520 : undefined,
              overflowY: ranking.length > 10 ? 'auto' : undefined,
              paddingRight: ranking.length > 10 ? 8 : undefined,
            }}
          >
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

      <Modal
        aberto={modalVenda}
        titulo="Cadastrar venda manual"
        onFechar={() => setModalVenda(false)}
        largura={560}
      >
        <FormVendaManual
          onCancelar={() => setModalVenda(false)}
          onCriou={() => {
            setModalVenda(false)
            setRefreshKey((k) => k + 1)
            vendasService.produtos().then(setProdutos).catch(() => {})
          }}
        />
      </Modal>

      <Modal
        aberto={modalRemover}
        titulo="Remover venda manual"
        onFechar={() => setModalRemover(false)}
        largura={720}
      >
        <RemoverVendasManuais
          filtro={filtro}
          onRemoveu={() => setRefreshKey((k) => k + 1)}
        />
      </Modal>
    </div>
  )
}

const METODOS: { valor: MetodoPagamento; label: string }[] = [
  { valor: 'pix', label: 'PIX' },
  { valor: 'cartao', label: 'Cartão' },
  { valor: 'boleto', label: 'Boleto' },
  { valor: 'transferencia', label: 'Transferência' },
  { valor: 'cartao_2x', label: 'Cartão (2 cartões)' },
  { valor: 'outro', label: 'Outro' },
]

function FormVendaManual({
  onCancelar,
  onCriou,
}: {
  onCancelar: () => void
  onCriou: () => void
}) {
  const NOVO = '__novo__'
  const [produtos, setProdutos] = useState<string[]>([])
  const [produtoSel, setProdutoSel] = useState('')
  const [produtoNovo, setProdutoNovo] = useState('')
  const [ofertas, setOfertas] = useState<OfertaBreakdown[]>([])
  const [carregandoOfertas, setCarregandoOfertas] = useState(false)
  const [ofertaSel, setOfertaSel] = useState('')
  const [ofertaNova, setOfertaNova] = useState('')
  const [valor, setValor] = useState('')
  const [quantidade, setQuantidade] = useState('1')
  const [metodo, setMetodo] = useState<MetodoPagamento>('pix')
  const [dataVenda, setDataVenda] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [compradorNome, setCompradorNome] = useState('')
  const [compradorEmail, setCompradorEmail] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const produtoNovoModo = produtoSel === NOVO
  const produtoFinal = (produtoNovoModo ? produtoNovo : produtoSel).trim()

  useEffect(() => {
    vendasService.produtos().then(setProdutos).catch(() => setProdutos([]))
  }, [])

  // ao escolher um produto existente, busca as ofertas reais dele
  useEffect(() => {
    setOfertaSel('')
    setOfertaNova('')
    setValor('')
    if (!produtoSel || produtoSel === NOVO) {
      setOfertas([])
      return
    }
    const hoje = format(new Date(), 'yyyy-MM-dd')
    setCarregandoOfertas(true)
    vendasService
      .ofertasPorProduto(produtoSel, '2020-01-01', hoje)
      .then(setOfertas)
      .catch(() => setOfertas([]))
      .finally(() => setCarregandoOfertas(false))
  }, [produtoSel])

  const selecionarOferta = (v: string) => {
    setOfertaSel(v)
    const of = ofertas[Number(v)]
    if (of && v !== NOVO) setValor(String(of.valor_override ?? of.valor_oferta))
  }

  // oferta escolhida: real (índice), nova (digitada) ou nenhuma
  const ofertaReal =
    !produtoNovoModo && ofertaSel !== '' && ofertaSel !== NOVO
      ? ofertas[Number(ofertaSel)]
      : undefined

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const payload: VendaManualCreatePayload = {
      produto: produtoFinal,
      valor: Number(valor),
      quantidade: Math.max(1, Number(quantidade) || 1),
      metodo_pagamento: metodo,
      // meio-dia UTC pra cair no dia certo independente de fuso
      data_venda: `${dataVenda}T12:00:00Z`,
      comprador_nome: compradorNome || null,
      comprador_email: compradorEmail || null,
      oferta_nome: ofertaReal ? ofertaReal.oferta_nome : ofertaNova.trim() || null,
      oferta_codigo: ofertaReal ? ofertaReal.oferta_codigo : null,
      tipo: 'unica',
    }
    try {
      await vendasService.criarManual(payload)
      onCriou()
    } catch (err) {
      setErro(extrairErro(err))
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
      <CampoVenda label="Produto" required>
        <select
          value={produtoSel}
          onChange={(e) => setProdutoSel(e.target.value)}
          required
          style={{ ...inputVenda, colorScheme: 'dark' }}
        >
          <option value="">Selecione o produto…</option>
          {produtos.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
          <option value={NOVO}>➕ Outro produto (digitar)</option>
        </select>
        {produtoNovoModo && (
          <input
            value={produtoNovo}
            onChange={(e) => setProdutoNovo(e.target.value)}
            placeholder="Nome do novo produto"
            required
            style={{ ...inputVenda, marginTop: 8 }}
          />
        )}
      </CampoVenda>

      <div style={{ display: 'grid', gridTemplateColumns: '0.7fr 1fr 1fr', gap: 12 }}>
        <CampoVenda label="Quantidade" required>
          <input
            type="number"
            min={1}
            max={200}
            step={1}
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            required
            title="Quantas vendas iguais cadastrar de uma vez"
            style={inputVenda}
          />
        </CampoVenda>
        <CampoVenda label="Valor (R$)" required>
          <input
            type="number"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="2997.00"
            required
            style={inputVenda}
          />
        </CampoVenda>
        <CampoVenda label="Data do pagamento" required>
          <input
            type="date"
            value={dataVenda}
            onChange={(e) => setDataVenda(e.target.value)}
            required
            style={{ ...inputVenda, colorScheme: 'dark' }}
          />
        </CampoVenda>
      </div>

      <CampoVenda label="Método de pagamento" required>
        <select
          value={metodo}
          onChange={(e) => setMetodo(e.target.value as MetodoPagamento)}
          style={{ ...inputVenda, colorScheme: 'dark' }}
        >
          {METODOS.map((m) => (
            <option key={m.valor} value={m.valor}>
              {m.label}
            </option>
          ))}
        </select>
      </CampoVenda>

      <CampoVenda label="Oferta (opcional)">
        {produtoNovoModo ? (
          <input
            value={ofertaNova}
            onChange={(e) => setOfertaNova(e.target.value)}
            placeholder="Nome da oferta (opcional)"
            style={inputVenda}
          />
        ) : (
          <>
            <select
              value={ofertaSel}
              onChange={(e) => selecionarOferta(e.target.value)}
              disabled={!produtoSel || carregandoOfertas}
              style={{ ...inputVenda, colorScheme: 'dark', opacity: !produtoSel ? 0.6 : 1 }}
            >
              <option value="">
                {!produtoSel
                  ? 'Escolha um produto primeiro'
                  : carregandoOfertas
                    ? 'Carregando…'
                    : 'Selecione a oferta…'}
              </option>
              {ofertas.map((o, i) => (
                <option key={o.oferta_codigo ?? i} value={String(i)}>
                  {(o.oferta_nome ?? 'Sem nome')} —{' '}
                  {formatBRL(o.valor_override ?? o.valor_oferta)}
                </option>
              ))}
              {produtoSel && <option value={NOVO}>➕ Outra oferta (digitar)</option>}
            </select>
            {ofertaSel === NOVO && (
              <input
                value={ofertaNova}
                onChange={(e) => setOfertaNova(e.target.value)}
                placeholder="Nome da oferta (opcional)"
                style={{ ...inputVenda, marginTop: 8 }}
              />
            )}
          </>
        )}
      </CampoVenda>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <CampoVenda label="Nome do comprador (opcional)">
          <input
            value={compradorNome}
            onChange={(e) => setCompradorNome(e.target.value)}
            placeholder="Maria Silva"
            style={inputVenda}
          />
        </CampoVenda>
        <CampoVenda label="Email do comprador (opcional)">
          <input
            type="email"
            value={compradorEmail}
            onChange={(e) => setCompradorEmail(e.target.value)}
            placeholder="maria@email.com"
            style={inputVenda}
          />
        </CampoVenda>
      </div>

      {erro && (
        <div
          style={{
            background: '#EF444422',
            border: '1px solid #EF444444',
            color: '#FCA5A5',
            padding: '8px 12px',
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          {erro}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
        <button
          type="button"
          onClick={onCancelar}
          disabled={enviando}
          style={{
            background: 'transparent',
            border: '1px solid #374151',
            color: '#9CA3AF',
            padding: '9px 16px',
            borderRadius: 8,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={enviando || !produtoFinal || !valor}
          style={{
            background: enviando ? '#4B5563' : '#7C6AF7',
            border: 'none',
            color: '#fff',
            padding: '9px 18px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: enviando ? 'not-allowed' : 'pointer',
            opacity: !produtoFinal || !valor ? 0.6 : 1,
          }}
        >
          {enviando ? 'Salvando…' : 'Cadastrar venda'}
        </button>
      </div>
    </form>
  )
}

const inputVenda: React.CSSProperties = {
  width: '100%',
  background: '#0F172A',
  border: '1px solid #374151',
  borderRadius: 8,
  padding: '9px 12px',
  color: '#F9FAFB',
  fontSize: 13,
}

function CampoVenda({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 11,
          color: '#9CA3AF',
          marginBottom: 6,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label} {required && <span style={{ color: '#7C6AF7' }}>*</span>}
      </label>
      {children}
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

function MultiSelect({
  label,
  selecionados,
  onChange,
  opcoes,
  placeholder,
}: {
  label: string
  selecionados: string[]
  onChange: (v: string[]) => void
  opcoes: string[]
  placeholder: string
}) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [aberto])

  const toggle = (opcao: string) => {
    if (selecionados.includes(opcao)) {
      onChange(selecionados.filter((s) => s !== opcao))
    } else {
      onChange([...selecionados, opcao])
    }
  }

  const resumo =
    selecionados.length === 0
      ? placeholder
      : selecionados.length === 1
        ? selecionados[0]
        : `${selecionados.length} selecionados`

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <label style={{ display: 'block', fontSize: 11, color: '#6B7280', marginBottom: 6 }}>
        {label}
      </label>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        style={{
          background: '#0F172A',
          border: '1px solid #374151',
          borderRadius: 8,
          padding: '8px 12px',
          color: selecionados.length ? '#F9FAFB' : '#6B7280',
          fontSize: 13,
          minWidth: 200,
          maxWidth: 260,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span
          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {resumo}
        </span>
        <span style={{ fontSize: 10, color: '#6B7280' }}>▼</span>
      </button>

      {aberto && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            zIndex: 30,
            width: 280,
            maxHeight: 300,
            overflowY: 'auto',
            background: '#111827',
            border: '1px solid #374151',
            borderRadius: 8,
            padding: 6,
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
          }}
        >
          {selecionados.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                color: '#7C6AF7',
                fontSize: 12,
                padding: '6px 8px',
                cursor: 'pointer',
              }}
            >
              Limpar seleção
            </button>
          )}
          {opcoes.length === 0 && (
            <p style={{ margin: 0, padding: '8px', fontSize: 12, color: '#6B7280' }}>
              Sem produtos.
            </p>
          )}
          {opcoes.map((o) => {
            const marcado = selecionados.includes(o)
            return (
              <label
                key={o}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 8px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: 13,
                  color: '#E5E7EB',
                  background: marcado ? '#1F2937' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => toggle(o)}
                  style={{ accentColor: '#7C6AF7', cursor: 'pointer' }}
                />
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {o}
                </span>
              </label>
            )
          })}
        </div>
      )}
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

function RemoverVendasManuais({
  filtro,
  onRemoveu,
}: {
  filtro: FiltroVendas
  onRemoveu: () => void
}) {
  const [vendas, setVendas] = useState<Venda[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const carregar = () => {
    setCarregando(true)
    setErro('')
    vendasService
      .listar(filtro)
      .then((vs) => setVendas(vs.filter((v) => v.plataforma === 'Manual')))
      .catch((e) => setErro(extrairErro(e)))
      .finally(() => setCarregando(false))
  }

  useEffect(carregar, []) // eslint-disable-line react-hooks/exhaustive-deps

  const remover = async (v: Venda) => {
    const rotulo = `${v.produto}${v.oferta_nome ? ' · ' + v.oferta_nome : ''}`
    if (!confirm(`Remover esta venda de ${formatBRL(v.valor)} (${rotulo})?`)) return
    try {
      await vendasService.remover(v.id)
      setVendas((vs) => vs.filter((x) => x.id !== v.id))
      onRemoveu()
    } catch (e) {
      alert(extrairErro(e))
    }
  }

  if (carregando) {
    return <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>Carregando…</p>
  }
  if (erro) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: '#FCA5A5' }}>{erro}</p>
    )
  }
  if (vendas.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
        Nenhuma venda manual no período/filtros selecionados.
      </p>
    )
  }

  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: '#6B7280' }}>
        Mostra só vendas cadastradas manualmente (PIX e afins) no período do
        dashboard. Vendas das plataformas devem ser estornadas na origem — o
        webhook de reembolso atualiza o status automaticamente.
      </p>
      <div style={{ display: 'grid', gap: 6 }}>
        {vendas.map((v) => (
          <div
            key={v.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '8px 10px',
              background: '#0F172A',
              border: '1px solid #1F2937',
              borderRadius: 6,
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: '#9CA3AF',
                fontFamily: 'monospace',
                width: 50,
              }}
            >
              {v.data_venda.slice(8, 10)}/{v.data_venda.slice(5, 7)}
            </span>
            <span style={{ flex: 1, fontSize: 13, color: '#F9FAFB', minWidth: 0 }}>
              {v.produto}
              {v.oferta_nome ? ` · ${v.oferta_nome}` : ''}
              {v.comprador_email ? (
                <span style={{ color: '#6B7280', fontSize: 11, marginLeft: 8 }}>
                  ({v.comprador_email})
                </span>
              ) : null}
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#F9FAFB',
                minWidth: 90,
                textAlign: 'right',
              }}
            >
              {formatBRL(v.valor)}
            </span>
            <button
              onClick={() => remover(v)}
              title="Remover esta venda"
              style={{
                background: 'transparent',
                border: '1px solid #374151',
                color: '#EF4444',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function IconeAtualizar({ girando }: { girando: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ animation: girando ? 'lm-spin 0.8s linear infinite' : undefined }}
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M8 16H3v5" />
    </svg>
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
