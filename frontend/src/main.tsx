import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import { registrarRecargaAposDeploy } from './lib/recarregarAposDeploy'
import './index.css'
import './styles/theme.css'

registrarRecargaAposDeploy()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
