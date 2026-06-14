import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { Layout } from '@/components/shared/Layout'
import { RotaProtegida } from '@/components/shared/RotaProtegida'
import { Configuracoes } from '@/pages/Configuracoes'
import { Lancamentos } from '@/pages/Lancamentos'
import { LancamentoDetalhe } from '@/pages/LancamentoDetalhe'
import { LancamentoPago } from '@/pages/LancamentoPago'
import { Login } from '@/pages/Login'
import { Perpetuos } from '@/pages/Perpetuos'
import { Placar } from '@/pages/Placar'
import { Vendas } from '@/pages/Vendas'
import { useAuthStore } from '@/store/authStore'

export default function App() {
  const inicializar = useAuthStore((s) => s.inicializar)

  useEffect(() => {
    inicializar()
  }, [inicializar])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RotaProtegida>
              <Layout />
            </RotaProtegida>
          }
        >
          <Route path="/" element={<Navigate to="/lancamentos" replace />} />
          <Route path="/lancamentos" element={<Lancamentos />} />
          <Route path="/lancamentos/:id" element={<LancamentoDetalhe />} />
          <Route path="/lancamento-pago" element={<LancamentoPago />} />
          <Route path="/perpetuos" element={<Perpetuos />} />
          <Route path="/vendas" element={<Vendas />} />
          <Route path="/placar" element={<Placar />} />
          <Route path="/configuracoes" element={<Configuracoes />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
