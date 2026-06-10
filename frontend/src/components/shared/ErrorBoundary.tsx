import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  erro: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null }

  static getDerivedStateFromError(erro: Error): State {
    return { erro }
  }

  componentDidCatch(erro: Error, info: { componentStack?: string | null }) {
    // Em produção isso vai pra console do navegador — o usuário consegue
    // copiar e mandar pra gente.
    console.error('[LM] Render crashed:', erro, info)
  }

  reset = () => this.setState({ erro: null })

  render() {
    if (!this.state.erro) return this.props.children

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: 'var(--bg, #0B0F19)',
          color: '#F9FAFB',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: 720,
            background: '#111827',
            border: '1px solid #1F2937',
            borderRadius: 12,
            padding: '1.75rem 2rem',
          }}
        >
          <h1 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700 }}>
            Alguma coisa quebrou na tela
          </h1>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: '#9CA3AF' }}>
            A página falhou ao renderizar. Detalhes técnicos abaixo — copie e
            mande, ou abra o console (F12) pra ver o stack completo.
          </p>
          <pre
            style={{
              background: '#0B0F19',
              border: '1px solid #1F2937',
              borderRadius: 8,
              padding: '12px 14px',
              fontSize: 12,
              color: '#EF4444',
              overflow: 'auto',
              maxHeight: 240,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {this.state.erro.message}
            {'\n\n'}
            {this.state.erro.stack}
          </pre>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              onClick={this.reset}
              style={{
                background: '#7C6AF7',
                border: 'none',
                color: '#fff',
                padding: '9px 16px',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Tentar novamente
            </button>
            <button
              onClick={() => window.location.reload()}
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
              Recarregar a página
            </button>
          </div>
        </div>
      </div>
    )
  }
}
