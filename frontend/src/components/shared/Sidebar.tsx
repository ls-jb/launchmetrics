import { NavLink, useNavigate } from 'react-router-dom'

import { useAuthStore } from '@/store/authStore'
import { useSidebarStore } from '@/store/sidebarStore'

type ItemMenu = {
  path: string
  label: string
  icone: (props: { cor: string }) => JSX.Element
  em_breve?: boolean
}

const ITENS: ItemMenu[] = [
  { path: '/lancamentos', label: 'Lançamentos', icone: IconeFoguete },
  { path: '/lancamento-pago', label: 'Lançamento Pago', icone: IconeRaio },
  { path: '/vendas', label: 'Dashboard de Vendas', icone: IconeGrafico },
  { path: '/placar', label: 'Placar de Líderes', icone: IconeTrofeu },
]

export function Sidebar() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const colapsada = useSidebarStore((s) => s.colapsada)
  const toggle = useSidebarStore((s) => s.toggle)

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  if (colapsada) {
    return (
      <aside
        style={{
          width: 28,
          minHeight: '100vh',
          background: 'var(--bg)',
          borderRight: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 18,
          position: 'sticky',
          top: 0,
        }}
      >
        <button
          onClick={toggle}
          title="Expandir menu"
          style={botaoToggle}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-faint)')}
        >
          ›
        </button>
      </aside>
    )
  }

  return (
    <aside
      style={{
        width: 232,
        minHeight: '100vh',
        background: 'var(--bg)',
        borderRight: '1px solid var(--border)',
        padding: '1.5rem 0.75rem',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
      }}
    >
      <button
        onClick={toggle}
        title="Recolher menu"
        style={{ ...botaoToggle, position: 'absolute', top: 14, right: 8 }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-faint)')}
      >
        ‹
      </button>
      <div style={{ padding: '0 0.75rem 1.5rem', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 32,
            height: 32,
            background: '#7C6AF7',
            borderRadius: 8,
            display: 'grid',
            placeItems: 'center',
            fontWeight: 700,
            fontSize: 14,
            color: '#fff',
          }}
        >
          LM
        </div>
        <div>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
            LaunchMetrics
          </p>
          <p style={{ margin: 0, fontSize: 10, color: 'var(--text-faint)', letterSpacing: '0.06em' }}>
            DASHBOARD INTERNO
          </p>
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {ITENS.map((item) => {
          const Icone = item.icone
          return (
            <NavLink
              key={item.path}
              to={item.path}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                color: isActive ? 'var(--text)' : 'var(--text-muted)',
                background: isActive ? 'var(--border)' : 'transparent',
                textDecoration: 'none',
                transition: 'background 0.15s, color 0.15s',
              })}
            >
              {({ isActive }) => (
                <>
                  <Icone cor={isActive ? '#7C6AF7' : 'var(--text-faint)'} />
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.em_breve && (
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 600,
                        color: '#F59E0B',
                        background: '#F59E0B22',
                        padding: '2px 6px',
                        borderRadius: 99,
                      }}
                    >
                      EM BREVE
                    </span>
                  )}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <NavLink
          to="/configuracoes"
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 12px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            color: isActive ? 'var(--text)' : 'var(--text-muted)',
            background: isActive ? 'var(--border)' : 'transparent',
            textDecoration: 'none',
            marginBottom: 8,
          })}
        >
          {({ isActive }) => (
            <>
              <IconeEngrenagem cor={isActive ? '#7C6AF7' : 'var(--text-faint)'} />
              <span>Configurações</span>
            </>
          )}
        </NavLink>

        {user && (
          <div style={{ padding: '0 0.75rem 10px' }}>
            <p
              style={{
                margin: 0,
                fontSize: 10,
                color: 'var(--text-dim)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Conectado como
            </p>
            <p
              style={{
                margin: '2px 0 0',
                fontSize: 12,
                color: 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={user.email ?? ''}
            >
              {user.email}
            </p>
          </div>
        )}
        <button
          onClick={handleLogout}
          style={{
            width: '100%',
            background: 'transparent',
            border: '1px solid var(--border-strong)',
            color: 'var(--text-muted)',
            padding: '8px 12px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'all 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--border)'
            e.currentTarget.style.color = 'var(--text)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--text-muted)'
          }}
        >
          Sair
        </button>
        <p
          style={{
            margin: '10px 0 0',
            padding: '0 0.75rem',
            fontSize: 10,
            color: 'var(--border-strong)',
            textAlign: 'center',
          }}
        >
          v0.1.0 · dev
        </p>
      </div>
    </aside>
  )
}

function IconeFoguete({ cor }: { cor: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/>
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>
    </svg>
  )
}

function IconeRaio({ cor }: { cor: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>
  )
}

function IconeGrafico({ cor }: { cor: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18"/>
      <path d="m19 9-5 5-4-4-3 3"/>
    </svg>
  )
}

function IconeTrofeu({ cor }: { cor: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
      <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
      <path d="M4 22h16"/>
      <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
    </svg>
  )
}

function IconeEngrenagem({ cor }: { cor: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

const botaoToggle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-faint)',
  cursor: 'pointer',
  fontSize: 16,
  lineHeight: 1,
  padding: '4px 6px',
  borderRadius: 6,
  transition: 'color 0.15s',
}
