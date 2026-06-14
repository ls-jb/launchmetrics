import { format } from 'date-fns'
import { useCallback, useEffect, useState } from 'react'

import { BotaoAtualizar } from '@/components/shared/BotaoAtualizar'
import { EditavelInline } from '@/components/shared/EditavelInline'
import { GraficoVendasProduto } from '@/components/shared/GraficoVendasProduto'
import { Modal } from '@/components/shared/Modal'
import { extrairErro } from '@/lib/erro'
import { formatBRL, formatNum } from '@/lib/tokens'
import {
  perpetuosService,
  type NovoPerpetuoPayload,
} from '@/services/perpetuosService'
import { vendasService } from '@/services/vendasService'
import { useAuthStore } from '@/store/authStore'
import type {
  Perpetuo,
  PerpetuoCompleto,
  PerpetuoProdutoDetalhe,
  PontoVendaProduto,
} from '@/types'

export function Perpetuos() {
  const papel = useAuthStore((s) => s.papel)
  const isAdmin = papel === 'admin'

  const [perps, setPerps] = useState<Perpetuo[]>([])
  const [carregandoLista, setCarregandoLista] = useState(true)
  const [perpetuoId, setPerpetuoId] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [modalNovo, setModalNovo] = useState(false)

  const recarregarLista = useCallback(() => {
    setCarregandoLista(true)
    setErro('')
    perpetuosService
      .listar()
      .then(setPerps)
      .catch((e) => setErro(extrairErro(e)))
      .finally(() => setCarregandoLista(false))
  }, [])

  useEffect(() => {
    recarregarLista()
  }, [recarregarLista])

  // Tela 1 — lista
  if (!perpetuoId) {
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
              Perpétuos
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>
              Produtos vendidos continuamente — métricas desde a data de início
            </p>
          </div>
          {isAdmin && (
            <button onClick={() => setModalNovo(true)} style={botaoPrimario}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Novo perpétuo
            </button>
          )}
        </header>

        {erro && <Aviso texto={`Erro: ${erro}`} />}

        {!carregandoLista && perps.length === 0 && (
          <CardVazio
            titulo="Nenhum perpétuo ainda"
            mensagem={
              isAdmin
                ? 'Clique em "+ Novo perpétuo" pra cadastrar o primeiro.'
                : 'Peça a um administrador pra cadastrar um perpétuo.'
            }
          />
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          {perps.map((p) => (
            <button
              key={p.id}
              onClick={() => setPerpetuoId(p.id)}
              style={cardClicavel}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#7C6AF7')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                  {p.nome}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>
                  Desde {fmtData(p.data_inicio)} · Investimento {formatBRL(p.investimento)}
                </p>
              </div>
              <span style={{ fontSize: 18, color: 'var(--text-dim)' }}>›</span>
            </button>
          ))}
        </div>

        <Modal
          aberto={modalNovo}
          titulo="Novo perpétuo"
          onFechar={() => setModalNovo(false)}
          largura={560}
        >
          <FormNovoPerpetuo
            onCancelar={() => setModalNovo(false)}
            onCriou={(novo) => {
              setModalNovo(false)
              recarregarLista()
              setPerpetuoId(novo.id)
            }}
          />
        </Modal>
      </div>
    )
  }

  // Tela 2 — detalhe
  return (
    <DetalhePerpetuo
      perpetuoId={perpetuoId}
      isAdmin={isAdmin}
      onVoltar={() => {
        setPerpetuoId(null)
        recarregarLista()
      }}
    />
  )
}

// ============================================================
// Detalhe
// ============================================================
function DetalhePerpetuo({
  perpetuoId,
  isAdmin,
  onVoltar,
}: {
  perpetuoId: string
  isAdmin: boolean
  onVoltar: () => void
}) {
  const [completo, setCompleto] = useState<PerpetuoCompleto | null>(null)
  const [vendasDia, setVendasDia] = useState<PontoVendaProduto[]>([])
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [erro, setErro] = useState('')
  const [modalProduto, setModalProduto] = useState(false)

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCarregando(true)
      else setAtualizando(true)
      try {
        const [c, v] = await Promise.all([
          perpetuosService.obter(perpetuoId),
          perpetuosService.vendasPorDia(perpetuoId),
        ])
        setCompleto(c)
        setVendasDia(v)
      } catch (e) {
        if (!silencioso) setErro(extrairErro(e))
      } finally {
        if (!silencioso) setCarregando(false)
        else setAtualizando(false)
      }
    },
    [perpetuoId],
  )

  useEffect(() => {
    carregar(false)
  }, [carregar])

  const salvarInvestimento = async (valor: number | null) => {
    const atualizado = await perpetuosService.atualizar(perpetuoId, {
      investimento: valor ?? 0,
    })
    setCompleto((prev) =>
      prev ? { ...prev, perpetuo: { ...prev.perpetuo, investimento: atualizado.investimento } } : prev,
    )
  }

  const removerPerpetuo = async () => {
    if (!completo) return
    if (
      !confirm(
        `Remover o perpétuo "${completo.perpetuo.nome}"?\n\nIsso apaga os produtos configurados dele. As vendas reais continuam intactas.`,
      )
    )
      return
    try {
      await perpetuosService.remover(perpetuoId)
      onVoltar()
    } catch (e) {
      alert(extrairErro(e))
    }
  }

  const removerProduto = async (id: string) => {
    if (!confirm('Remover esse produto do perpétuo?')) return
    try {
      await perpetuosService.removerProduto(id)
      carregar(false)
    } catch (e) {
      alert(extrairErro(e))
    }
  }

  if (carregando && !completo) {
    return <p style={textoMudo}>Carregando…</p>
  }
  if (erro) {
    return <Aviso texto={`Erro: ${erro}`} />
  }
  if (!completo) return null

  const receitaTotal = completo.produtos.reduce((acc, p) => acc + Number(p.receita), 0)
  const qtdTotal = completo.produtos.reduce((acc, p) => acc + p.quantidade, 0)
  const investimento = Number(completo.perpetuo.investimento)
  const roas = investimento > 0 ? receitaTotal / investimento : 0

  return (
    <div>
      <button onClick={onVoltar} style={botaoVoltar}>
        ‹ Voltar aos perpétuos
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
            {completo.perpetuo.nome}
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>
            Desde {fmtData(completo.perpetuo.data_inicio)}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <BotaoAtualizar onClick={() => carregar(true)} atualizando={atualizando} />
          {isAdmin && (
            <>
              <button onClick={() => setModalProduto(true)} style={botaoSecundario}>
                + Adicionar produto
              </button>
              <button onClick={removerPerpetuo} style={{ ...botaoSecundario, color: '#EF4444' }}>
                Remover perpétuo
              </button>
            </>
          )}
        </div>
      </header>

      {/* Receita total */}
      <div style={{ ...cardCabecalho, marginBottom: '0.75rem' }}>
        <div>
          <p style={rotuloCard}>Receita total do perpétuo</p>
          <p style={{ margin: '4px 0 0', fontSize: 28, fontWeight: 700, color: '#3ECFB2' }}>
            {formatBRL(receitaTotal)}
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-faint)' }}>Vendas</p>
          <p style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
            {formatNum(qtdTotal)}
          </p>
        </div>
      </div>

      {/* Investimento + ROAS */}
      <div style={{ ...cardCabecalho, padding: '1.25rem 1.5rem', marginBottom: '1.5rem' }}>
        <div>
          <p style={rotuloCard}>Investimento</p>
          <div style={{ marginTop: 4 }}>
            {isAdmin ? (
              <EditavelInline
                label="Investimento"
                valor={investimento || null}
                formatar={formatBRL}
                aoSalvar={salvarInvestimento}
                destaque
                cor="#F59E0B"
              />
            ) : (
              <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: '#F59E0B' }}>
                {formatBRL(investimento)}
              </p>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ margin: 0, fontSize: 11, color: 'var(--text-faint)' }}>ROAS</p>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: 22,
              fontWeight: 700,
              color: investimento > 0 ? '#7C6AF7' : 'var(--text-dim)',
            }}
          >
            {investimento > 0 ? `${roas.toFixed(2)}x` : '—'}
          </p>
        </div>
      </div>

      {/* Produtos */}
      <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
        Produtos
      </h3>
      {completo.produtos.length === 0 ? (
        <CardVazio
          titulo="Sem produtos cadastrados"
          mensagem={
            isAdmin
              ? 'Clique em "+ Adicionar produto" pra incluir um. Vendas batem pelo nome exato em vendas.produto.'
              : 'Peça a um admin pra cadastrar produtos.'
          }
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gap: 12,
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            marginBottom: '1.5rem',
          }}
        >
          {completo.produtos.map((p) => (
            <CardProduto
              key={p.id}
              detalhe={p}
              isAdmin={isAdmin}
              onRemover={removerProduto}
            />
          ))}
        </div>
      )}

      {/* Gráfico */}
      <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
        Vendas por dia
      </h3>
      <div style={{ marginBottom: '1.5rem' }}>
        <GraficoVendasProduto dados={vendasDia} />
      </div>

      <Modal
        aberto={modalProduto}
        titulo="Adicionar produto ao perpétuo"
        onFechar={() => setModalProduto(false)}
        largura={520}
      >
        <FormAdicionarProduto
          perpetuoId={perpetuoId}
          onCancelar={() => setModalProduto(false)}
          onCriou={() => {
            setModalProduto(false)
            carregar(false)
          }}
        />
      </Modal>
    </div>
  )
}

// ============================================================
// Card de produto (com breakdown por oferta)
// ============================================================
function CardProduto({
  detalhe,
  isAdmin,
  onRemover,
}: {
  detalhe: PerpetuoProdutoDetalhe
  isAdmin: boolean
  onRemover: (id: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const cpl = detalhe.quantidade > 0 ? Number(detalhe.receita) / detalhe.quantidade : 0
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '1rem 1.25rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {detalhe.produto}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Receita
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 700, color: '#3ECFB2' }}>
            {formatBRL(detalhe.receita)}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => onRemover(detalhe.id)}
            title="Remover produto do perpétuo"
            style={botaoIconeRemover}
          >
            ×
          </button>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 10,
          marginTop: 10,
          paddingTop: 10,
          borderTop: '1px solid var(--border)',
        }}
      >
        <MetricaInline label="Vendas" valor={formatNum(detalhe.quantidade)} />
        <MetricaInline label="Ticket médio" valor={`R$ ${cpl.toFixed(2)}`} />
      </div>

      {detalhe.ofertas.length > 0 && (
        <>
          <button
            onClick={() => setAberto((v) => !v)}
            style={{
              marginTop: 12,
              background: 'transparent',
              border: 'none',
              color: 'var(--text-faint)',
              fontSize: 12,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            {aberto ? '▾' : '▸'} {detalhe.ofertas.length} {detalhe.ofertas.length === 1 ? 'oferta' : 'ofertas'}
          </button>
          {aberto && (
            <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
              {detalhe.ofertas.map((o, i) => (
                <div
                  key={`${o.oferta_codigo ?? 'sem'}-${i}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    fontSize: 12,
                    padding: '4px 0',
                  }}
                >
                  <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '60%' }}>
                    {o.oferta_nome ?? '(sem oferta)'}
                  </span>
                  <span style={{ color: 'var(--text)', fontWeight: 600 }}>
                    {formatNum(o.quantidade)} · {formatBRL(o.receita)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function MetricaInline({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p
        style={{
          margin: 0,
          fontSize: 10,
          color: 'var(--text-faint)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </p>
      <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
        {valor}
      </p>
    </div>
  )
}

// ============================================================
// Form: novo perpétuo
// ============================================================
function FormNovoPerpetuo({
  onCancelar,
  onCriou,
}: {
  onCancelar: () => void
  onCriou: (p: Perpetuo) => void
}) {
  const [nome, setNome] = useState('')
  const [dataInicio, setDataInicio] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [investimento, setInvestimento] = useState('')
  const [produtosDisponiveis, setProdutosDisponiveis] = useState<string[]>([])
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [filtro, setFiltro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    vendasService.produtos().then(setProdutosDisponiveis).catch(() => setProdutosDisponiveis([]))
  }, [])

  const alternar = (produto: string) => {
    setSelecionados((prev) => {
      const novo = new Set(prev)
      if (novo.has(produto)) novo.delete(produto)
      else novo.add(produto)
      return novo
    })
  }

  const filtrados = produtosDisponiveis.filter((p) =>
    p.toLowerCase().includes(filtro.toLowerCase()),
  )

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const payload: NovoPerpetuoPayload = {
      nome,
      data_inicio: dataInicio,
      investimento: investimento ? Number(investimento) : 0,
      produtos: Array.from(selecionados),
    }
    try {
      const novo = await perpetuosService.criar(payload)
      onCriou(novo)
    } catch (err) {
      setErro(extrairErro(err))
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} style={{ display: 'grid', gap: 14 }}>
      <Campo label="Nome do perpétuo" tipo="text" valor={nome} onChange={setNome} placeholder="Ex: Comunidade Vida Alinhada" required />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Campo label="Data de início" tipo="date" valor={dataInicio} onChange={setDataInicio} required />
        <Campo label="Investimento (R$)" tipo="number" valor={investimento} onChange={setInvestimento} placeholder="0,00" step="0.01" />
      </div>

      <div>
        <label style={rotulo}>Produtos ({selecionados.size} selecionados)</label>
        <input
          type="text"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Filtrar produtos…"
          style={{ ...inputBase, marginBottom: 8 }}
        />
        <div
          style={{
            maxHeight: 220,
            overflowY: 'auto',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            padding: 8,
            background: 'var(--surface-2)',
          }}
        >
          {filtrados.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-faint)', padding: 8 }}>
              {produtosDisponiveis.length === 0 ? 'Carregando produtos…' : 'Nenhum produto.'}
            </p>
          ) : (
            filtrados.map((p) => (
              <label
                key={p}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 4px',
                  fontSize: 13,
                  color: 'var(--text)',
                  cursor: 'pointer',
                  borderRadius: 4,
                }}
              >
                <input
                  type="checkbox"
                  checked={selecionados.has(p)}
                  onChange={() => alternar(p)}
                />
                <span>{p}</span>
              </label>
            ))
          )}
        </div>
      </div>

      {erro && <Aviso texto={`Erro: ${erro}`} />}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onCancelar} disabled={enviando} style={botaoSecundarioModal}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando || !nome} style={{ ...botaoPrimario, opacity: !nome ? 0.6 : 1 }}>
          {enviando ? 'Criando…' : 'Criar perpétuo'}
        </button>
      </div>
    </form>
  )
}

// ============================================================
// Form: adicionar produto ao perpétuo existente
// ============================================================
function FormAdicionarProduto({
  perpetuoId,
  onCancelar,
  onCriou,
}: {
  perpetuoId: string
  onCancelar: () => void
  onCriou: () => void
}) {
  const [produtosDisponiveis, setProdutosDisponiveis] = useState<string[]>([])
  const [filtro, setFiltro] = useState('')
  const [selecionado, setSelecionado] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    vendasService.produtos().then(setProdutosDisponiveis).catch(() => setProdutosDisponiveis([]))
  }, [])

  const filtrados = produtosDisponiveis.filter((p) =>
    p.toLowerCase().includes(filtro.toLowerCase()),
  )

  const enviar = async () => {
    if (!selecionado) return
    setErro('')
    setEnviando(true)
    try {
      await perpetuosService.adicionarProduto(perpetuoId, selecionado)
      onCriou()
    } catch (err) {
      setErro(extrairErro(err))
      setEnviando(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <input
        type="text"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        placeholder="Filtrar produtos…"
        style={inputBase}
        autoFocus
      />
      <div
        style={{
          maxHeight: 280,
          overflowY: 'auto',
          border: '1px solid var(--border-strong)',
          borderRadius: 8,
          padding: 8,
          background: 'var(--surface-2)',
        }}
      >
        {filtrados.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-faint)', padding: 8 }}>
            {produtosDisponiveis.length === 0 ? 'Carregando…' : 'Nenhum produto.'}
          </p>
        ) : (
          filtrados.map((p) => (
            <label
              key={p}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 4px',
                fontSize: 13,
                color: 'var(--text)',
                cursor: 'pointer',
                borderRadius: 4,
                background: selecionado === p ? 'var(--border)' : 'transparent',
              }}
            >
              <input
                type="radio"
                name="produto-perpetuo"
                checked={selecionado === p}
                onChange={() => setSelecionado(p)}
              />
              <span>{p}</span>
            </label>
          ))
        )}
      </div>

      {erro && <Aviso texto={`Erro: ${erro}`} />}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onCancelar} disabled={enviando} style={botaoSecundarioModal}>
          Cancelar
        </button>
        <button
          onClick={enviar}
          disabled={enviando || !selecionado}
          style={{ ...botaoPrimario, opacity: !selecionado ? 0.6 : 1 }}
        >
          {enviando ? 'Adicionando…' : 'Adicionar'}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Helpers visuais
// ============================================================
function CardVazio({ titulo, mensagem }: { titulo: string; mensagem: string }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px dashed var(--border-strong)',
        borderRadius: 12,
        padding: '2.5rem 1.5rem',
        textAlign: 'center',
      }}
    >
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
        {titulo}
      </p>
      <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>{mensagem}</p>
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
        padding: '10px 14px',
        color: 'var(--text-error)',
        fontSize: 13,
      }}
    >
      {texto}
    </div>
  )
}

function Campo({
  label,
  tipo,
  valor,
  onChange,
  placeholder,
  required,
  step,
}: {
  label: string
  tipo: string
  valor: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  step?: string
}) {
  return (
    <div>
      <label style={rotulo}>{label}</label>
      <input
        type={tipo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        step={step}
        style={inputBase}
      />
    </div>
  )
}

function fmtData(iso: string) {
  if (!iso) return '—'
  return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4)
}

// ============================================================
// Estilos
// ============================================================
const rotulo: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: 'var(--text-muted)',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const inputBase: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface-2)',
  border: '1px solid var(--border-strong)',
  borderRadius: 8,
  padding: '9px 12px',
  color: 'var(--text)',
  fontSize: 13,
  colorScheme: 'dark',
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
  gap: 8,
}

const botaoSecundario: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border-strong)',
  color: 'var(--text-muted)',
  padding: '8px 14px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}

const botaoSecundarioModal: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-strong)',
  color: 'var(--text-muted)',
  padding: '9px 16px',
  borderRadius: 8,
  fontSize: 13,
  cursor: 'pointer',
}

const botaoVoltar: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#7C6AF7',
  fontSize: 13,
  cursor: 'pointer',
  padding: 0,
  marginBottom: 14,
}

const botaoIconeRemover: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-strong)',
  color: '#EF4444',
  borderRadius: 6,
  width: 28,
  height: 28,
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
  lineHeight: 1,
}

const cardClicavel: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '1rem 1.25rem',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  textAlign: 'left',
  transition: 'border-color 0.15s',
}

const cardCabecalho: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '1.25rem 1.5rem',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  flexWrap: 'wrap',
  gap: 12,
}

const rotuloCard: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  color: 'var(--text-faint)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const textoMudo: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text-faint)',
}
