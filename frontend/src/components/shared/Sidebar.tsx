import { NavLink, useNavigate } from 'react-router-dom'

import { useAuthStore } from '@/store/authStore'

const ITENS = [
  { path: '/lancamentos', label: 'Lançamentos', icone: IconeFoguete },
  { path: '/lancamento-pago', label: 'Lançamento Pago', icone: IconeRaio, em_breve: true },
  { path: '/vendas', label: 'Dashboard de Vendas', icone: IconeGrafico },
]

export function Sidebar() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside
      style={{
        width: 232,
        minHeight: '100vh',
        background: '#0B0F19',
        borderRight: '1px solid #1F2937',
        padding: '1.5rem 0.75rem',
        display: 'flex',
        flexDirection: 'column',
        position: 'sticky',
        top: 0,
      }}
    >
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
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#F9FAFB' }}>
            LaunchMetrics
          </p>
          <p style={{ margin: 0, fontSize: 10, color: '#6B7280', letterSpacing: '0.06em' }}>
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
                color: isActive ? '#F9FAFB' : '#9CA3AF',
                background: isActive ? '#1F2937' : 'transparent',
                textDecoration: 'none',
                transition: 'background 0.15s, color 0.15s',
              })}
            >
              {({ isActive }) => (
                <>
                  <Icone cor={isActive ? '#7C6AF7' : '#6B7280'} />
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

      <div style={{ marginTop: 'auto', borderTop: '1px solid #1F2937', paddingTop: 12 }}>
        {user && (
          <div style={{ padding: '0 0.75rem 10px' }}>
            <p
              style={{
                margin: 0,
                fontSize: 10,
                color: '#4B5563',
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
                color: '#9CA3AF',
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
            border: '1px solid #374151',
            color: '#9CA3AF',
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
            e.currentTarget.style.background = '#1F2937'
            e.currentTarget.style.color = '#F9FAFB'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = '#9CA3AF'
          }}
        >
          Sair
        </button>
        <p
          style={{
            margin: '10px 0 0',
            padding: '0 0.75rem',
            fontSize: 10,
            color: '#374151',
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
