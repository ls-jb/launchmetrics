import { useEffect, useState } from 'react'

import { Modal } from '@/components/shared/Modal'
import {
  usuariosService,
  type UsuarioCreatePayload,
} from '@/services/usuariosService'
import { useAuthStore } from '@/store/authStore'
import type { Papel, Usuario } from '@/types'

export function Configuracoes() {
  const papel = useAuthStore((s) => s.papel)

  return (
    <div>
      <header style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: '#F9FAFB' }}>
          Configurações
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
          Tema e gestão de usuários
        </p>
      </header>

      <SecaoTema />

      {papel === 'admin' ? (
        <SecaoUsuarios />
      ) : (
        <Card>
          <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
            Gestão de usuários disponível apenas para administradores.
          </p>
        </Card>
      )}
    </div>
  )
}

function SecaoTema() {
  return (
    <Card>
      <p style={titulo}>Tema</p>
      <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
        Em breve — escuro (atual), claro e azul. Por enquanto o sistema usa o
        tema escuro.
      </p>
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
      {erro && <p style={{ ...textoMudo, color: '#FCA5A5' }}>{erro}</p>}

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
                background: '#0F172A',
                border: '1px solid #1F2937',
                borderRadius: 8,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 13, color: '#F9FAFB', fontWeight: 500 }}>
                  {u.nome || u.email}
                </p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6B7280' }}>
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
                    background: '#111827',
                    border: '1px solid #374151',
                    borderRadius: 6,
                    padding: '5px 8px',
                    color: '#E5E7EB',
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
                      border: '1px solid #374151',
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
          disabled={enviando || !email || senha.length < 6}
          style={{
            background: enviando ? '#4B5563' : '#7C6AF7',
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
        background: '#111827',
        border: '1px solid #1F2937',
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
  color: '#E5E7EB',
}

const textoMudo: React.CSSProperties = { margin: 0, fontSize: 13, color: '#6B7280' }

const inputBase: React.CSSProperties = {
  width: '100%',
  background: '#0F172A',
  border: '1px solid #374151',
  borderRadius: 8,
  padding: '9px 12px',
  color: '#F9FAFB',
  fontSize: 13,
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

function extrairErro(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const resp = (err as { response?: { data?: { detail?: string } } }).response
    if (resp?.data?.detail) return resp.data.detail
  }
  if (err instanceof Error) return err.message
  return 'Erro desconhecido'
}
