import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'

import { useAuthStore } from '@/store/authStore'

export function RotaProtegida({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const carregando = useAuthStore((s) => s.carregando)

  if (carregando) return <TelaCarregando />
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function TelaCarregando() {
  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--text-faint)',
        fontSize: 13,
      }}
    >
      Carregando…
    </div>
  )
}
