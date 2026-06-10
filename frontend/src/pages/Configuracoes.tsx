import { useEffect, useState } from 'react'

import { Modal } from '@/components/shared/Modal'
import { extrairErro } from '@/lib/erro'
import { formatBRL } from '@/lib/tokens'
import { placarService } from '@/services/placarService'
import {
  usuariosService,
  type UsuarioCreatePayload,
} from '@/services/usuariosService'
import { vendasService } from '@/services/vendasService'
import { useAuthStore } from '@/store/authStore'
import { useThemeStore, type Tema } from '@/store/themeStore'
import type {
  OfertaBreakdown,
  Papel,
  PlacarCompleto,
  PlacarLancamento,
  Usuario,
} from '@/types'

export function Configuracoes() {
  const papel = useAuthStore((s) => s.papel)

  return (
    <div>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
          Configurações
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>
          Tema e gestão de usuários
        </p>
      </header>

      <SecaoTema />

      {papel === 'admin' ? (
        <>
          <SecaoPlacar />
          <SecaoUsuarios />
        </>
      ) : (
        <Card>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>
            Gestão de usuários e do placar disponível apenas para administradores.
          </p>
        </Card>
      )}
    </div>
  )
}

// ============================================================
// Placar de líderes — cadastro de lançamentos, ofertas e vendedores
// ============================================================
function SecaoPlacar() {
  const [lancs, setLancs] = useState<PlacarLancamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [novoNome, setNovoNome] = useState('')
  const [criando, setCriando] = useState(false)
  const [gerenciar, setGerenciar] = useState<PlacarLancamento | null>(null)

  const recarregar = () => {
    setCarregando(true)
    setErro('')
    placarService
      .listarLancamentos()
      .then(setLancs)
      .catch((e) => setErro(extrairErro(e)))
      .finally(() => setCarregando(false))
  }

  useEffect(() => {
    recarregar()
  }, [])

  const criar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!novoNome.trim()) return
    setCriando(true)
    try {
      await placarService.criarLancamento(novoNome.trim())
      setNovoNome('')
      recarregar()
    } catch (err) {
      alert(extrairErro(err))
    } finally {
      setCriando(false)
    }
  }

  const ativar = async (l: PlacarLancamento) => {
    await placarService.atualizarLancamento(l.id, { ativo: true })
    recarregar()
  }

  const remover = async (l: PlacarLancamento) => {
    if (
      !confirm(
        `Remover o lançamento "${l.nome}"? Isso apaga as ofertas, vendedores e todas as marcações dele.`,
      )
    )
      return
    try {
      await placarService.removerLancamento(l.id)
      recarregar()
    } catch (err) {
      alert(extrairErro(err))
    }
  }

  return (
    <Card>
      <p style={titulo}>Placar de Líderes</p>
      <form onSubmit={criar} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          placeholder="Nome do lançamento (ex: CVA 05/26)"
          style={{ ...inputBase, flex: 1 }}
        />
        <button
          type="submit"
          disabled={criando || !novoNome.trim()}
          style={botaoRoxo(criando || !novoNome.trim())}
        >
          + Adicionar lançamento
        </button>
      </form>

      {carregando && <p style={textoMudo}>Carregando…</p>}
      {erro && <p style={{ ...textoMudo, color: 'var(--text-error)' }}>{erro}</p>}

      <div style={{ display: 'grid', gap: 8 }}>
        {!carregando && lancs.length === 0 && (
          <p style={textoMudo}>Nenhum lançamento cadastrado ainda.</p>
        )}
        {lancs.map((l) => (
          <div
            key={l.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              padding: '10px 12px',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
                {l.nome}
              </span>
              {l.ativo && (
                <span
                  style={{
                    fontSize: 9,
                    fontWeight: 600,
                    color: '#3ECFB2',
                    background: '#3ECFB222',
                    padding: '2px 6px',
                    borderRadius: 99,
                  }}
                >
                  ATIVO
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {!l.ativo && (
                <button onClick={() => ativar(l)} style={botaoSecundario}>
                  Ativar
                </button>
              )}
              <button onClick={() => setGerenciar(l)} style={botaoSecundario}>
                Gerenciar
              </button>
              <button
                onClick={() => remover(l)}
                style={{ ...botaoSecundario, color: '#EF4444' }}
              >
                Remover
              </button>
            </div>
          </div>
        ))}
      </div>

      <Modal
        aberto={gerenciar !== null}
        titulo={gerenciar ? `Gerenciar — ${gerenciar.nome}` : ''}
        onFechar={() => setGerenciar(null)}
        largura={700}
      >
        {gerenciar && <GerenciarLancamento lancamentoId={gerenciar.id} />}
      </Modal>
    </Card>
  )
}

function GerenciarLancamento({ lancamentoId }: { lancamentoId: string }) {
  const NOVO = '__novo__'
  const TODOS = '__todos__'
  const [placar, setPlacar] = useState<PlacarCompleto | null>(null)
  const [erro, setErro] = useState('')

  // produtos/ofertas reais (vindos do dashboard de vendas)
  const [produtos, setProdutos] = useState<string[]>([])
  const [produtoSel, setProdutoSel] = useState('')
  const [produtoNovo, setProdutoNovo] = useState('')
  const [ofertasReais, setOfertasReais] = useState<OfertaBreakdown[]>([])
  const [carregandoOfertas, setCarregandoOfertas] = useState(false)
  const [ofertaSel, setOfertaSel] = useState('')
  const [ofertaNova, setOfertaNova] = useState('')
  const [valor, setValor] = useState('')
  // form vendedor
  const [vendedorNome, setVendedorNome] = useState('')

  const produtoNovoModo = produtoSel === NOVO
  const produtoFinal = (produtoNovoModo ? produtoNovo : produtoSel).trim()

  const recarregar = () => {
    placarService
      .obter(lancamentoId)
      .then(setPlacar)
      .catch((e) => setErro(extrairErro(e)))
  }

  useEffect(() => {
    recarregar()
    vendasService.produtos().then(setProdutos).catch(() => setProdutos([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lancamentoId])

  // ao escolher um produto existente, busca as ofertas reais dele
  useEffect(() => {
    setOfertaSel('')
    setOfertaNova('')
    setValor('')
    if (!produtoSel || produtoSel === NOVO) {
      setOfertasReais([])
      return
    }
    const hoje = new Date().toISOString().slice(0, 10)
    setCarregandoOfertas(true)
    vendasService
      .ofertasPorProduto(produtoSel, '2020-01-01', hoje)
      .then((ofs) => setOfertasReais(ofs))
      .catch(() => setOfertasReais([]))
      .finally(() => setCarregandoOfertas(false))
  }, [produtoSel])

  const selecionarOferta = (v: string) => {
    setOfertaSel(v)
    const of = ofertasReais[Number(v)]
    if (of && v !== NOVO) setValor(String(of.valor_override ?? of.valor_oferta))
  }

  const ofertaReal =
    !produtoNovoModo && ofertaSel !== '' && ofertaSel !== NOVO
      ? ofertasReais[Number(ofertaSel)]
      : undefined

  const addOferta = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!produtoFinal || !valor) return
    try {
      await placarService.adicionarOferta(lancamentoId, {
        produto: produtoFinal,
        oferta: ofertaReal ? ofertaReal.oferta_nome : ofertaNova.trim() || null,
        oferta_codigo: ofertaReal ? ofertaReal.oferta_codigo : null,
        valor: Number(valor),
      })
      setProdutoSel('')
      setProdutoNovo('')
      setOfertasReais([])
      setOfertaSel('')
      setOfertaNova('')
      setValor('')
      recarregar()
    } catch (err) {
      alert(extrairErro(err))
    }
  }

  const addVendedor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!vendedorNome.trim()) return
    try {
      await placarService.adicionarVendedor(lancamentoId, vendedorNome.trim())
      setVendedorNome('')
      recarregar()
    } catch (err) {
      alert(extrairErro(err))
    }
  }

  if (!placar) {
    return <p style={textoMudo}>{erro || 'Carregando…'}</p>
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* OFERTAS */}
      <div>
        <p style={{ ...titulo, marginBottom: 8 }}>Ofertas (do dashboard de vendas)</p>
        <form onSubmit={addOferta} style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
          <select
            value={produtoSel}
            onChange={(e) => setProdutoSel(e.target.value)}
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
              style={inputBase}
            />
          )}

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
                onChange={(e) => selecionarOferta(e.target.value)}
                disabled={!produtoSel || carregandoOfertas}
                style={{ ...inputBase, colorScheme: 'dark', opacity: !produtoSel ? 0.6 : 1 }}
              >
                <option value="">
                  {!produtoSel
                    ? 'Escolha um produto primeiro'
                    : carregandoOfertas
                      ? 'Carregando ofertas…'
                      : 'Selecione a oferta…'}
                </option>
                {produtoSel && (
                  <option value={TODOS}>📊 Todo o produto (soma todas as ofertas)</option>
                )}
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
                  style={inputBase}
                />
              )}
            </>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              step="0.01"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="Valor da oferta (R$)"
              style={{ ...inputBase, flex: 1 }}
            />
            <button
              type="submit"
              disabled={!produtoFinal || !valor}
              style={botaoRoxo(!produtoFinal || !valor)}
            >
              Adicionar oferta
            </button>
          </div>
        </form>
        <div style={{ display: 'grid', gap: 6 }}>
          {placar.ofertas.length === 0 && (
            <p style={textoMudo}>Nenhuma oferta ainda.</p>
          )}
          {placar.ofertas.map((o) => (
            <LinhaRemovivel
              key={o.id}
              texto={`${o.produto}${o.oferta ? ` · ${o.oferta}` : ''} — ${formatBRL(o.valor)}`}
              onRemover={async () => {
                await placarService.removerOferta(o.id)
                recarregar()
              }}
            />
          ))}
        </div>
      </div>

      {/* VENDEDORES */}
      <div>
        <p style={{ ...titulo, marginBottom: 8 }}>Vendedores (time comercial)</p>
        <form onSubmit={addVendedor} style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <input
            value={vendedorNome}
            onChange={(e) => setVendedorNome(e.target.value)}
            placeholder="Nome do vendedor"
            style={{ ...inputBase, flex: 1 }}
          />
          <button type="submit" disabled={!vendedorNome.trim()} style={botaoRoxo(!vendedorNome.trim())}>
            Adicionar
          </button>
        </form>
        <div style={{ display: 'grid', gap: 6 }}>
          {placar.vendedores.length === 0 && (
            <p style={textoMudo}>Nenhum vendedor ainda.</p>
          )}
          {placar.vendedores.map((v) => (
            <LinhaRemovivel
              key={v.id}
              texto={v.nome}
              onRemover={async () => {
                if (!confirm(`Remover ${v.nome} e as marcações dele?`)) return
                await placarService.removerVendedor(v.id)
                recarregar()
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function LinhaRemovivel({
  texto,
  onRemover,
}: {
  texto: string
  onRemover: () => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        padding: '8px 10px',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 6,
      }}
    >
      <span style={{ fontSize: 13, color: 'var(--text-strong)', minWidth: 0 }}>{texto}</span>
      <button
        onClick={onRemover}
        title="Remover"
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-faint)',
          cursor: 'pointer',
          fontSize: 16,
          lineHeight: 1,
          padding: 0,
        }}
      >
        ×
      </button>
    </div>
  )
}

function SecaoTema() {
  const tema = useThemeStore((s) => s.tema)
  const setTema = useThemeStore((s) => s.setTema)
  const opcoes: { valor: Tema; label: string; preview: string[] }[] = [
    { valor: 'padrao', label: 'Padrão', preview: ['#0b0f19', '#111827', '#7C6AF7'] },
    { valor: 'escuro', label: 'Escuro', preview: ['#000000', '#0a0a0a', '#7C6AF7'] },
    { valor: 'claro', label: 'Claro', preview: ['#f3f4f6', '#ffffff', '#7C6AF7'] },
  ]
  return (
    <Card>
      <p style={titulo}>Tema</p>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--text-faint)' }}>
        Escolha o visual da plataforma. A preferência fica salva no seu navegador.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {opcoes.map((o) => {
          const ativo = tema === o.valor
          return (
            <button
              key={o.valor}
              onClick={() => setTema(o.valor)}
              style={{
                background: 'transparent',
                border: ativo ? '2px solid #7C6AF7' : '1px solid var(--border-strong)',
                borderRadius: 10,
                padding: '12px',
                cursor: 'pointer',
                color: 'var(--text)',
                fontSize: 13,
                fontWeight: 600,
                textAlign: 'left',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', gap: 4 }}>
                {o.preview.map((cor, i) => (
                  <span
                    key={i}
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      background: cor,
                      border: '1px solid var(--border)',
                    }}
                  />
                ))}
              </div>
              <span>
                {o.label}
                {ativo && (
                  <span style={{ color: '#7C6AF7', marginLeft: 6 }}>· ativo</span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </Card>
  )
}

function SecaoUsuarios() {
  const meuUserId = useAuthStore((s) => s.user?.id)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [modalAberto, setModalAberto] = useState(false)

  const recarregar = () => {
    setCarregando(true)
    setErro('')
    usuariosService
      .listar()
      .then(setUsuarios)
      .catch((e) => setErro(extrairErro(e)))
      .finally(() => setCarregando(false))
  }

  useEffect(() => {
    recarregar()
  }, [])

  const trocarPapel = async (u: Usuario, novoPapel: Papel) => {
    await usuariosService.atualizarPapel(u.user_id, novoPapel)
    recarregar()
  }

  const remover = async (u: Usuario) => {
    if (!confirm(`Remover o usuário ${u.email}? Essa ação não pode ser desfeita.`)) {
      return
    }
    try {
      await usuariosService.remover(u.user_id)
      recarregar()
    } catch (e) {
      alert(extrairErro(e))
    }
  }

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <p style={{ ...titulo, margin: 0 }}>Usuários</p>
        <button
          onClick={() => setModalAberto(true)}
          style={{
            background: '#7C6AF7',
            border: 'none',
            color: '#fff',
            padding: '8px 14px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Adicionar usuário
        </button>
      </div>

      {carregando && <p style={textoMudo}>Carregando…</p>}
      {erro && <p style={{ ...textoMudo, color: 'var(--text-error)' }}>{erro}</p>}

      {!carregando && (
        <div style={{ display: 'grid', gap: 8 }}>
          {usuarios.map((u) => (
            <div
              key={u.user_id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
                  {u.nome || u.email}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-faint)' }}>
                  {u.email}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select
                  value={u.papel}
                  onChange={(e) => trocarPapel(u, e.target.value as Papel)}
                  disabled={u.user_id === meuUserId}
                  title={
                    u.user_id === meuUserId
                      ? 'Você não pode mudar seu próprio papel'
                      : ''
                  }
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 6,
                    padding: '5px 8px',
                    color: 'var(--text-strong)',
                    fontSize: 12,
                    colorScheme: 'dark',
                    opacity: u.user_id === meuUserId ? 0.5 : 1,
                  }}
                >
                  <option value="admin">Admin (configura)</option>
                  <option value="viewer">Viewer (só vê)</option>
                </select>
                {u.user_id !== meuUserId && (
                  <button
                    onClick={() => remover(u)}
                    title="Remover usuário"
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border-strong)',
                      color: '#EF4444',
                      borderRadius: 6,
                      padding: '5px 10px',
                      fontSize: 12,
                      cursor: 'pointer',
                    }}
                  >
                    Remover
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        aberto={modalAberto}
        titulo="Adicionar usuário"
        onFechar={() => setModalAberto(false)}
      >
        <FormUsuario
          onCancelar={() => setModalAberto(false)}
          onCriou={() => {
            setModalAberto(false)
            recarregar()
          }}
        />
      </Modal>
    </Card>
  )
}

function FormUsuario({
  onCancelar,
  onCriou,
}: {
  onCancelar: () => void
  onCriou: () => void
}) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [nome, setNome] = useState('')
  const [papel, setPapel] = useState<Papel>('viewer')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const payload: UsuarioCreatePayload = {
      email,
      senha,
      nome: nome || null,
      papel,
    }
    try {
      await usuariosService.criar(payload)
      onCriou()
    } catch (err) {
      setErro(extrairErro(err))
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
      <Campo label="Nome (opcional)">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome da pessoa"
          style={inputBase}
        />
      </Campo>
      <Campo label="Email" required>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="pessoa@email.com"
          required
          style={inputBase}
        />
      </Campo>
      <Campo label="Senha provisória" required>
        <input
          type="text"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          placeholder="mínimo 6 caracteres"
          minLength={6}
          required
          style={inputBase}
        />
      </Campo>
      <Campo label="Papel" required>
        <select
          value={papel}
          onChange={(e) => setPapel(e.target.value as Papel)}
          style={{ ...inputBase, colorScheme: 'dark' }}
        >
          <option value="viewer">Viewer — só visualiza os dashboards</option>
          <option value="admin">Admin — configura tudo</option>
        </select>
      </Campo>

      {erro && (
        <div
          style={{
            background: '#EF444422',
            border: '1px solid #EF444444',
            color: 'var(--text-error)',
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
            border: '1px solid var(--border-strong)',
            color: 'var(--text-muted)',
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
          disabled={enviando || !email || senha.length < 6}
          style={{
            background: enviando ? 'var(--text-dim)' : '#7C6AF7',
            border: 'none',
            color: '#fff',
            padding: '9px 18px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: enviando ? 'not-allowed' : 'pointer',
            opacity: !email || senha.length < 6 ? 0.6 : 1,
          }}
        >
          {enviando ? 'Criando…' : 'Criar usuário'}
        </button>
      </div>
    </form>
  )
}

// ============================================================
// UI helpers
// ============================================================
function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '1.25rem',
        marginBottom: '1.25rem',
      }}
    >
      {children}
    </div>
  )
}

const titulo: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text-strong)',
}

const textoMudo: React.CSSProperties = { margin: 0, fontSize: 13, color: 'var(--text-faint)' }

const inputBase: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface-2)',
  border: '1px solid var(--border-strong)',
  borderRadius: 8,
  padding: '9px 12px',
  color: 'var(--text)',
  fontSize: 13,
}

function botaoRoxo(desabilitado: boolean): React.CSSProperties {
  return {
    background: desabilitado ? 'var(--text-dim)' : '#7C6AF7',
    border: 'none',
    color: '#fff',
    padding: '9px 14px',
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    cursor: desabilitado ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  }
}

const botaoSecundario: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-strong)',
  color: 'var(--text-muted)',
  borderRadius: 6,
  padding: '5px 10px',
  fontSize: 12,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
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

