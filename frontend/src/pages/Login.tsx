import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

import { useAuthStore } from '@/store/authStore'

export function Login() {
  const navigate = useNavigate()
  const { user, login } = useAuthStore()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  if (user) return <Navigate to="/lancamentos" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      await login(email, senha)
      navigate('/lancamentos', { replace: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setErro(traduzir(msg))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0B0F19',
        display: 'grid',
        placeItems: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 400,
          background: '#111827',
          border: '1px solid #1F2937',
          borderRadius: 12,
          padding: '2rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: '1.75rem' }}>
          <div
            style={{
              width: 40,
              height: 40,
              background: '#7C6AF7',
              borderRadius: 10,
              display: 'grid',
              placeItems: 'center',
              fontWeight: 700,
              fontSize: 16,
              color: '#fff',
            }}
          >
            LM
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#F9FAFB' }}>
              LaunchMetrics
            </h1>
            <p style={{ margin: 0, fontSize: 11, color: '#6B7280', letterSpacing: '0.06em' }}>
              ENTRAR NO DASHBOARD
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
          <Campo
            label="Email"
            tipo="email"
            valor={email}
            onChange={setEmail}
            placeholder="seu@email.com"
            autoFocus
          />
          <Campo
            label="Senha"
            tipo="password"
            valor={senha}
            onChange={setSenha}
            placeholder="••••••••"
          />

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

          <button
            type="submit"
            disabled={enviando || !email || !senha}
            style={{
              background: enviando ? '#4B5563' : '#7C6AF7',
              border: 'none',
              color: '#fff',
              padding: '11px 16px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: enviando ? 'not-allowed' : 'pointer',
              opacity: !email || !senha ? 0.6 : 1,
              transition: 'background 0.15s',
              marginTop: 6,
            }}
          >
            {enviando ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Campo({
  label,
  tipo,
  valor,
  onChange,
  placeholder,
  autoFocus,
}: {
  label: string
  tipo: string
  valor: string
  onChange: (v: string) => void
  placeholder?: string
  autoFocus?: boolean
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
        {label}
      </label>
      <input
        type={tipo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        required
        style={{
          width: '100%',
          background: '#0F172A',
          border: '1px solid #374151',
          borderRadius: 8,
          padding: '10px 12px',
          color: '#F9FAFB',
          fontSize: 14,
          colorScheme: 'dark',
        }}
      />
    </div>
  )
}

function traduzir(msg: string): string {
  const m = msg.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Email ou senha incorretos.'
  if (m.includes('email not confirmed')) return 'Email não confirmado. Verifique sua caixa de entrada.'
  if (m.includes('user not found')) return 'Usuário não encontrado.'
  if (m.includes('network')) return 'Falha de conexão. Tente novamente.'
  return msg
}
