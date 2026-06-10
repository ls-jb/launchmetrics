import { format } from 'date-fns'
import { useCallback, useEffect, useState } from 'react'

import { BotaoAtualizar } from '@/components/shared/BotaoAtualizar'
import { Modal } from '@/components/shared/Modal'
import { formatBRL, formatNum } from '@/lib/tokens'
import {
  lancamentosPagosService,
  type NovaOfertaPayload,
} from '@/services/lancamentosPagosService'
import { vendasService } from '@/services/vendasService'
import { useAuthStore } from '@/store/authStore'
import type {
  CategoriaLancPago,
  LancamentoPago as LancPago,
  LancamentoPagoCompleto,
  LancamentoPagoOfertaDetalhe,
  OfertaBreakdown,
} from '@/types'

const CATEGORIAS: { valor: CategoriaLancPago; label: string; cor: string }[] = [
  { valor: 'ingresso', label: 'Ingresso', cor: '#3ECFB2' },
  { valor: 'order_bump_ingresso', label: 'Order Bump (Ingresso)', cor: '#F59E0B' },
  { valor: 'principal', label: 'Principal', cor: '#7C6AF7' },
  { valor: 'order_bump_principal', label: 'Order Bump (Principal)', cor: '#F59E0B' },
  { valor: 'upsell', label: 'Upsell', cor: '#60A5FA' },
  { valor: 'downsell', label: 'Downsell', cor: 'var(--text-muted)' },
]
const CAT_LABEL = Object.fromEntries(CATEGORIAS.map((c) => [c.valor, c.label]))
const CAT_COR = Object.fromEntries(CATEGORIAS.map((c) => [c.valor, c.cor]))

export function LancamentoPago() {
  const papel = useAuthStore((s) => s.papel)
  const isAdmin = papel === 'admin'

  const [lancs, setLancs] = useState<LancPago[]>([])
  const [carregandoLista, setCarregandoLista] = useState(true)
  const [lancId, setLancId] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [modalNovo, setModalNovo] = useState(false)

  const recarregarLista = useCallback(() => {
    setCarregandoLista(true)
    setErro('')
    lancamentosPagosService
      .listar()
      .then(setLancs)
      .catch((e) => setErro(extrairErro(e)))
      .finally(() => setCarregandoLista(false))
  }, [])

  useEffect(() => {
    recarregarLista()
  }, [recarregarLista])

  // ============================================================
  // TELA 1 — lista
  // ============================================================
  if (!lancId) {
    return (
      <div>
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: '1.5rem',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
              Lançamento Pago
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>
              Lançamentos com vendas de ingresso + carrinho do produto principal
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setModalNovo(true)}
              style={botaoPrimario}
            >
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Novo lançamento
            </button>
          )}
        </header>

        {erro && <Aviso texto={`Erro: ${erro}`} />}

        {!carregandoLista && lancs.length === 0 && (
          <CardVazio
            titulo="Nenhum lançamento ainda"
            mensagem={
              isAdmin
                ? 'Clique em "+ Novo lançamento" pra cadastrar o primeiro.'
                : 'Peça a um administrador para cadastrar um lançamento.'
            }
          />
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          {lancs.map((l) => (
            <button
              key={l.id}
              onClick={() => setLancId(l.id)}
              style={cardClicavel}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#7C6AF7')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                  {l.nome}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>
                  Ingresso: {fmtData(l.ingresso_inicio)}–{fmtData(l.ingresso_fim)} ·
                  Principal: {fmtData(l.principal_inicio)}–{fmtData(l.principal_fim)}
                </p>
              </div>
              <span style={{ fontSize: 18, color: 'var(--text-dim)' }}>›</span>
            </button>
          ))}
        </div>

        <Modal
          aberto={modalNovo}
          titulo="Novo lançamento pago"
          onFechar={() => setModalNovo(false)}
          largura={520}
        >
          <FormNovoLancamento
            onCancelar={() => setModalNovo(false)}
            onCriou={(novo) => {
              setModalNovo(false)
              recarregarLista()
              setLancId(novo.id)
            }}
          />
        </Modal>
      </div>
    )
  }

  // ============================================================
  // TELA 2 — detalhe
  // ============================================================
  return (
    <DetalheLancamento
      lancamentoId={lancId}
      isAdmin={isAdmin}
      onVoltar={() => {
        setLancId(null)
        recarregarLista()
      }}
    />
  )
}

function DetalheLancamento({
  lancamentoId,
  isAdmin,
  onVoltar,
}: {
  lancamentoId: string
  isAdmin: boolean
  onVoltar: () => void
}) {
  const [placar, setPlacar] = useState<LancamentoPagoCompleto | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [erro, setErro] = useState('')
  const [modalOferta, setModalOferta] = useState(false)
  const [ajusteAlvo, setAjusteAlvo] = useState<LancamentoPagoOfertaDetalhe | null>(null)

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCarregando(true)
      else setAtualizando(true)
      try {
        const p = await lancamentosPagosService.obter(lancamentoId)
        setPlacar(p)
      } catch (e) {
        if (!silencioso) setErro(extrairErro(e))
      } finally {
        if (!silencioso) setCarregando(false)
        else setAtualizando(false)
      }
    },
    [lancamentoId],
  )

  useEffect(() => {
    carregar(false)
  }, [carregar])

  // auto-refresh a cada 30s pra ver vendas novas caindo
  useEffect(() => {
    const id = setInterval(() => carregar(true), 30_000)
    return () => clearInterval(id)
  }, [carregar])

  const removerLancamento = async () => {
    if (!placar) return
    if (
      !confirm(
        `Remover o lançamento "${placar.lancamento.nome}"? Isso apaga as ofertas configuradas dele. As vendas reais continuam intactas.`,
      )
    )
      return
    try {
      await lancamentosPagosService.remover(lancamentoId)
      onVoltar()
    } catch (e) {
      alert(extrairErro(e))
    }
  }

  const removerOferta = async (id: string) => {
    if (!confirm('Remover essa oferta do lançamento?')) return
    try {
      await lancamentosPagosService.removerOferta(id)
      carregar(false)
    } catch (e) {
      alert(extrairErro(e))
    }
  }

  const removerAjuste = async (id: string) => {
    if (!confirm('Remover essa venda manual?')) return
    try {
      await lancamentosPagosService.removerAjuste(id)
      carregar(false)
    } catch (e) {
      alert(extrairErro(e))
    }
  }

  if (carregando && !placar) {
    return <p style={textoMudo}>Carregando…</p>
  }
  if (erro) {
    return <Aviso texto={`Erro: ${erro}`} />
  }
  if (!placar) return null

  const totalGeralReceita = placar.totais_por_categoria.reduce(
    (acc, t) => acc + t.receita,
    0,
  )
  const totalGeralQtd = placar.totais_por_categoria.reduce(
    (acc, t) => acc + t.quantidade,
    0,
  )

  return (
    <div>
      <button onClick={onVoltar} style={botaoVoltar}>
        ‹ Voltar aos lançamentos
      </button>

      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
            {placar.lancamento.nome}
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>
            Ingresso: {fmtData(placar.lancamento.ingresso_inicio)}–
            {fmtData(placar.lancamento.ingresso_fim)} · Principal:{' '}
            {fmtData(placar.lancamento.principal_inicio)}–
            {fmtData(placar.lancamento.principal_fim)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <BotaoAtualizar onClick={() => carregar(true)} atualizando={atualizando} />
          {isAdmin && (
            <>
              <button onClick={() => setModalOferta(true)} style={botaoSecundario}>
                + Adicionar oferta
              </button>
              <button onClick={removerLancamento} style={{ ...botaoSecundario, color: '#EF4444' }}>
                Remover lançamento
              </button>
            </>
          )}
        </div>
      </header>

      {/* Card de total geral */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '1.25rem 1.5rem',
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              color: 'var(--text-faint)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Receita total do lançamento
          </p>
          <p style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 700, color: '#3ECFB2' }}>
            {formatBRL(totalGeralReceita)}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-faint)' }}>Vendas</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
            {formatNum(totalGeralQtd)}
          </p>
        </div>
      </div>

      {/* Cards por categoria */}
      <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
        Por categoria
      </h3>
      {placar.totais_por_categoria.length === 0 ? (
        <CardVazio
          titulo="Sem vendas (ou sem ofertas configuradas)"
          mensagem={
            isAdmin
              ? 'Adicione ofertas e marque a categoria de cada uma. Aí os totais aparecem aqui.'
              : 'O lançamento ainda não tem ofertas configuradas.'
          }
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 12,
            marginBottom: '1.5rem',
          }}
        >
          {placar.totais_por_categoria.map((t) => (
            <CardCategoria
              key={t.categoria}
              categoria={t.categoria}
              quantidade={t.quantidade}
              receita={t.receita}
              ofertas={t.ofertas}
              isAdmin={isAdmin}
              onRemoverOferta={removerOferta}
              onAdicionarAjuste={(o) => setAjusteAlvo(o)}
              onRemoverAjuste={removerAjuste}
            />
          ))}
        </div>
      )}

      <Modal
        aberto={modalOferta}
        titulo="Adicionar oferta ao lançamento"
        onFechar={() => setModalOferta(false)}
        largura={580}
      >
        <FormNovaOferta
          lancamentoId={lancamentoId}
          onCancelar={() => setModalOferta(false)}
          onCriou={() => {
            setModalOferta(false)
            carregar(false)
          }}
        />
      </Modal>

      <Modal
        aberto={ajusteAlvo !== null}
        titulo={
          ajusteAlvo
            ? `Adicionar venda manual — ${ajusteAlvo.produto}${ajusteAlvo.oferta_nome ? ' · ' + ajusteAlvo.oferta_nome : ''}`
            : ''
        }
        onFechar={() => setAjusteAlvo(null)}
        largura={520}
      >
        {ajusteAlvo && (
          <FormAjusteManual
            oferta={ajusteAlvo}
            onCancelar={() => setAjusteAlvo(null)}
            onCriou={() => {
              setAjusteAlvo(null)
              carregar(false)
            }}
          />
        )}
      </Modal>
    </div>
  )
}

function FormNovoLancamento({
  onCancelar,
  onCriou,
}: {
  onCancelar: () => void
  onCriou: (l: LancPago) => void
}) {
  const hoje = format(new Date(), 'yyyy-MM-dd')
  const [nome, setNome] = useState('')
  const [ingressoInicio, setIngressoInicio] = useState(hoje)
  const [ingressoFim, setIngressoFim] = useState(hoje)
  const [principalInicio, setPrincipalInicio] = useState(hoje)
  const [principalFim, setPrincipalFim] = useState(hoje)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      const l = await lancamentosPagosService.criar({
        nome: nome.trim(),
        ingresso_inicio: ingressoInicio,
        ingresso_fim: ingressoFim,
        principal_inicio: principalInicio,
        principal_fim: principalFim,
      })
      onCriou(l)
    } catch (e) {
      setErro(extrairErro(e))
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
      <Campo label="Nome" required>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Ex: Vida Alinhada — semana 23/06"
          required
          style={inputBase}
        />
      </Campo>

      <div>
        <p
          style={{
            margin: '0 0 6px',
            fontSize: 11,
            color: '#3ECFB2',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontWeight: 600,
          }}
        >
          Período de venda do ingresso
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Campo label="Início" required>
            <input
              type="date"
              value={ingressoInicio}
              onChange={(e) => setIngressoInicio(e.target.value)}
              required
              style={{ ...inputBase, colorScheme: 'dark' }}
            />
          </Campo>
          <Campo label="Fim" required>
            <input
              type="date"
              value={ingressoFim}
              onChange={(e) => setIngressoFim(e.target.value)}
              required
              style={{ ...inputBase, colorScheme: 'dark' }}
            />
          </Campo>
        </div>
      </div>

      <div>
        <p
          style={{
            margin: '0 0 6px',
            fontSize: 11,
            color: '#7C6AF7',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontWeight: 600,
          }}
        >
          Período de venda do produto principal
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Campo label="Início (abertura do carrinho)" required>
            <input
              type="date"
              value={principalInicio}
              onChange={(e) => setPrincipalInicio(e.target.value)}
              required
              style={{ ...inputBase, colorScheme: 'dark' }}
            />
          </Campo>
          <Campo label="Fim" required>
            <input
              type="date"
              value={principalFim}
              onChange={(e) => setPrincipalFim(e.target.value)}
              required
              style={{ ...inputBase, colorScheme: 'dark' }}
            />
          </Campo>
        </div>
      </div>

      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-faint)' }}>
        Ingresso e Principal contam só as vendas dentro do próprio intervalo. Pode
        haver um gap entre eles (ex: dias de aula).
      </p>
      {erro && <Aviso texto={erro} />}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onCancelar} disabled={enviando} style={botaoSecundario}>
          Cancelar
        </button>
        <button
          type="submit"
          disabled={enviando || !nome.trim()}
          style={{
            ...botaoPrimario,
            opacity: enviando || !nome.trim() ? 0.6 : 1,
            cursor: enviando || !nome.trim() ? 'not-allowed' : 'pointer',
          }}
        >
          {enviando ? 'Criando…' : 'Criar lançamento'}
        </button>
      </div>
    </form>
  )
}

function FormNovaOferta({
  lancamentoId,
  onCancelar,
  onCriou,
}: {
  lancamentoId: string
  onCancelar: () => void
  onCriou: () => void
}) {
  const NOVO = '__novo__'
  const [produtos, setProdutos] = useState<string[]>([])
  const [produtoSel, setProdutoSel] = useState('')
  const [produtoNovo, setProdutoNovo] = useState('')
  const [ofertasReais, setOfertasReais] = useState<OfertaBreakdown[]>([])
  const [carregandoOfs, setCarregandoOfs] = useState(false)
  const [ofertaSel, setOfertaSel] = useState('')
  const [ofertaNova, setOfertaNova] = useState('')
  const [categoria, setCategoria] = useState<CategoriaLancPago>('ingresso')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const produtoNovoModo = produtoSel === NOVO
  const produtoFinal = (produtoNovoModo ? produtoNovo : produtoSel).trim()

  useEffect(() => {
    vendasService.produtos().then(setProdutos).catch(() => setProdutos([]))
  }, [])

  useEffect(() => {
    setOfertaSel('')
    setOfertaNova('')
    if (!produtoSel || produtoSel === NOVO) {
      setOfertasReais([])
      return
    }
    const hoje = format(new Date(), 'yyyy-MM-dd')
    setCarregandoOfs(true)
    vendasService
      .ofertasPorProduto(produtoSel, '2020-01-01', hoje)
      .then(setOfertasReais)
      .catch(() => setOfertasReais([]))
      .finally(() => setCarregandoOfs(false))
  }, [produtoSel])

  const ofertaReal =
    !produtoNovoModo && ofertaSel !== '' && ofertaSel !== NOVO
      ? ofertasReais[Number(ofertaSel)]
      : undefined

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const payload: NovaOfertaPayload = {
      produto: produtoFinal,
      oferta_nome: ofertaReal ? ofertaReal.oferta_nome : ofertaNova.trim() || null,
      oferta_codigo: ofertaReal ? ofertaReal.oferta_codigo : null,
      categoria,
    }
    try {
      await lancamentosPagosService.adicionarOferta(lancamentoId, payload)
      onCriou()
    } catch (e) {
      setErro(extrairErro(e))
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
      <Campo label="Produto" required>
        <select
          value={produtoSel}
          onChange={(e) => setProdutoSel(e.target.value)}
          required
          style={{ ...inputBase, colorScheme: 'dark' }}
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
            style={{ ...inputBase, marginTop: 8 }}
          />
        )}
      </Campo>

      <Campo label="Oferta (opcional)">
        {produtoNovoModo ? (
          <input
            value={ofertaNova}
            onChange={(e) => setOfertaNova(e.target.value)}
            placeholder="Nome da oferta (opcional)"
            style={inputBase}
          />
        ) : (
          <>
            <select
              value={ofertaSel}
              onChange={(e) => setOfertaSel(e.target.value)}
              disabled={!produtoSel || carregandoOfs}
              style={{ ...inputBase, colorScheme: 'dark', opacity: !produtoSel ? 0.6 : 1 }}
            >
              <option value="">
                {!produtoSel
                  ? 'Escolha um produto primeiro'
                  : carregandoOfs
                    ? 'Carregando…'
                    : 'Selecione a oferta…'}
              </option>
              {ofertasReais.map((o, i) => (
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
                style={{ ...inputBase, marginTop: 8 }}
              />
            )}
          </>
        )}
      </Campo>

      <Campo label="Categoria" required>
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value as CategoriaLancPago)}
          style={{ ...inputBase, colorScheme: 'dark' }}
        >
          {CATEGORIAS.map((c) => (
            <option key={c.valor} value={c.valor}>
              {c.label}
            </option>
          ))}
        </select>
      </Campo>

      {erro && <Aviso texto={erro} />}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onCancelar} disabled={enviando} style={botaoSecundario}>
          Cancelar
        </button>
        <button
          type="submit"
          disabled={enviando || !produtoFinal}
          style={{
            ...botaoPrimario,
            opacity: enviando || !produtoFinal ? 0.6 : 1,
            cursor: enviando || !produtoFinal ? 'not-allowed' : 'pointer',
          }}
        >
          {enviando ? 'Adicionando…' : 'Adicionar oferta'}
        </button>
      </div>
    </form>
  )
}

function FormAjusteManual({
  oferta,
  onCancelar,
  onCriou,
}: {
  oferta: LancamentoPagoOfertaDetalhe
  onCancelar: () => void
  onCriou: () => void
}) {
  const [quantidade, setQuantidade] = useState('1')
  const [valor, setValor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      await lancamentosPagosService.adicionarAjuste(oferta.id, {
        quantidade: Math.max(1, Number(quantidade) || 1),
        valor: Number(valor),
        descricao: descricao.trim() || null,
      })
      onCriou()
    } catch (e) {
      setErro(extrairErro(e))
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-faint)' }}>
        Soma vendas só na visão deste lançamento — não toca o dashboard nem a
        tabela de vendas reais. Útil pra incluir vendas que saíram fora da
        janela do lançamento.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '0.6fr 1fr', gap: 12 }}>
        <Campo label="Quantidade" required>
          <input
            type="number"
            min={1}
            max={200}
            step={1}
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            required
            style={inputBase}
          />
        </Campo>
        <Campo label="Valor unitário (R$)" required>
          <input
            type="number"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            placeholder="Ex: 47.00"
            required
            style={inputBase}
          />
        </Campo>
      </div>
      <Campo label="Descrição (opcional)">
        <input
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          placeholder="Ex: PIX que entrou em 16/06"
          maxLength={200}
          style={inputBase}
        />
      </Campo>
      {erro && <Aviso texto={erro} />}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onCancelar} disabled={enviando} style={botaoSecundario}>
          Cancelar
        </button>
        <button
          type="submit"
          disabled={enviando || !valor || Number(valor) <= 0}
          style={{
            ...botaoPrimario,
            opacity: enviando || !valor || Number(valor) <= 0 ? 0.6 : 1,
            cursor: enviando || !valor || Number(valor) <= 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {enviando ? 'Adicionando…' : 'Adicionar venda manual'}
        </button>
      </div>
    </form>
  )
}

// ============================================================
// Sub-componentes e estilos
// ============================================================
function CardCategoria({
  categoria,
  quantidade,
  receita,
  ofertas,
  isAdmin,
  onRemoverOferta,
  onAdicionarAjuste,
  onRemoverAjuste,
}: {
  categoria: CategoriaLancPago
  quantidade: number
  receita: number
  ofertas: LancamentoPagoOfertaDetalhe[]
  isAdmin: boolean
  onRemoverOferta: (id: string) => void
  onAdicionarAjuste: (o: LancamentoPagoOfertaDetalhe) => void
  onRemoverAjuste: (id: string) => void
}) {
  const cor = CAT_COR[categoria]
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '1rem 1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <div>
        <p
          style={{
            margin: '0 0 6px',
            fontSize: 11,
            color: 'var(--text-faint)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {CAT_LABEL[categoria]}
        </p>
        <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: cor }}>
          {formatBRL(receita)}
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>
          {formatNum(quantidade)} {quantidade === 1 ? 'venda' : 'vendas'}
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 4,
          borderTop: '1px solid var(--border)',
          paddingTop: 10,
        }}
      >
        {ofertas.map((o) => (
          <div key={o.id} style={{ display: 'grid', gap: 2, minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '6px 4px',
                minWidth: 0,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: 13,
                    fontWeight: 500,
                    color: o.quantidade > 0 ? 'var(--text)' : 'var(--text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={o.produto}
                >
                  {o.produto}
                </p>
                {o.oferta_nome && (
                  <p
                    style={{
                      margin: '2px 0 0',
                      fontSize: 11,
                      color: 'var(--text-faint)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={o.oferta_nome}
                  >
                    {o.oferta_nome}
                  </p>
                )}
              </div>
              <span
                style={{
                  fontSize: 11,
                  color: 'var(--text-faint)',
                  whiteSpace: 'nowrap',
                  width: 70,
                  textAlign: 'right',
                }}
              >
                {formatNum(o.quantidade)} {o.quantidade === 1 ? 'venda' : 'vendas'}
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: o.quantidade > 0 ? 'var(--text)' : 'var(--text-dim)',
                  whiteSpace: 'nowrap',
                  width: 100,
                  textAlign: 'right',
                }}
              >
                {formatBRL(o.receita)}
              </span>
              {isAdmin && (
                <>
                  <button
                    onClick={() => onAdicionarAjuste(o)}
                    title="Adicionar venda manual (apenas visual neste lançamento)"
                    style={{
                      ...botaoXis,
                      color: '#3ECFB2',
                      fontSize: 14,
                    }}
                  >
                    +
                  </button>
                  <button
                    onClick={() => onRemoverOferta(o.id)}
                    title="Remover oferta deste lançamento"
                    style={botaoXis}
                  >
                    ×
                  </button>
                </>
              )}
            </div>

            {o.ajustes.map((aj) => (
              <div
                key={aj.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '2px 4px 2px 16px',
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    color: '#3ECFB2',
                    background: '#3ECFB222',
                    padding: '1px 5px',
                    borderRadius: 99,
                  }}
                >
                  MANUAL
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={aj.descricao ?? ''}
                >
                  {aj.descricao || `${aj.quantidade}× ${formatBRL(aj.valor)}`}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--text-faint)',
                    whiteSpace: 'nowrap',
                    width: 60,
                    textAlign: 'right',
                  }}
                >
                  {aj.quantidade} {aj.quantidade === 1 ? 'venda' : 'vendas'}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--text-strong)',
                    whiteSpace: 'nowrap',
                    width: 90,
                    textAlign: 'right',
                  }}
                >
                  {formatBRL(aj.quantidade * aj.valor)}
                </span>
                {isAdmin && (
                  <button
                    onClick={() => onRemoverAjuste(aj.id)}
                    title="Remover venda manual"
                    style={botaoXis}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function CardVazio({ titulo, mensagem }: { titulo: string; mensagem: string }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px dashed var(--border-strong)',
        borderRadius: 12,
        padding: '2rem 1.5rem',
        textAlign: 'center',
      }}
    >
      <p style={{ margin: '0 0 8px', fontSize: 15, fontWeight: 600, color: 'var(--text-strong)' }}>
        {titulo}
      </p>
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>{mensagem}</p>
    </div>
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div
      style={{
        background: '#EF444411',
        border: '1px solid #EF444444',
        borderRadius: 8,
        padding: '0.75rem 1rem',
        color: 'var(--text-error)',
        fontSize: 13,
        marginBottom: '1rem',
      }}
    >
      {texto}
    </div>
  )
}

function Campo({
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
          color: 'var(--text-muted)',
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

function fmtData(iso: string): string {
  // iso = YYYY-MM-DD → dd/mm
  return iso.slice(8, 10) + '/' + iso.slice(5, 7)
}

function extrairErro(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const resp = (err as { response?: { data?: { detail?: string } } }).response
    if (resp?.data?.detail) return resp.data.detail
  }
  if (err instanceof Error) return err.message
  return 'Erro desconhecido'
}

const inputBase: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface-2)',
  border: '1px solid var(--border-strong)',
  borderRadius: 8,
  padding: '9px 12px',
  color: 'var(--text)',
  fontSize: 13,
}

const botaoPrimario: React.CSSProperties = {
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
  gap: 6,
}

const botaoSecundario: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-strong)',
  color: 'var(--text-muted)',
  padding: '10px 14px',
  borderRadius: 8,
  fontSize: 13,
  cursor: 'pointer',
}

const botaoVoltar: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-muted)',
  fontSize: 13,
  cursor: 'pointer',
  padding: 0,
  marginBottom: 14,
  display: 'flex',
  alignItems: 'center',
  gap: 6,
}

const botaoXis: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-faint)',
  cursor: 'pointer',
  fontSize: 16,
  lineHeight: 1,
  padding: 0,
}

const textoMudo: React.CSSProperties = { margin: 0, fontSize: 13, color: 'var(--text-faint)' }

const cardClicavel: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  textAlign: 'left',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '16px 18px',
  cursor: 'pointer',
  transition: 'border-color 0.15s',
}
