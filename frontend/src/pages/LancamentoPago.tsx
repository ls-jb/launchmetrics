export function LancamentoPago() {
  return (
    <div>
      <header style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#F9FAFB' }}>
            Lançamento Pago
          </h1>
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: '#F59E0B',
              background: '#F59E0B22',
              border: '1px solid #F59E0B44',
              padding: '3px 10px',
              borderRadius: 99,
              letterSpacing: '0.06em',
            }}
          >
            EM DESENVOLVIMENTO
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: '#6B7280' }}>
          Módulo dedicado a lançamentos com tráfego pago direto para a página de vendas.
        </p>
      </header>

      <div
        style={{
          background: '#111827',
          border: '1px dashed #374151',
          borderRadius: 12,
          padding: '4rem 2rem',
          textAlign: 'center',
          maxWidth: 560,
          margin: '3rem auto',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            background: '#7C6AF722',
            border: '1px solid #7C6AF744',
            borderRadius: 16,
            display: 'grid',
            placeItems: 'center',
            margin: '0 auto 16px',
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#7C6AF7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
          </svg>
        </div>
        <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600, color: '#F9FAFB' }}>
          Em breve
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: '#9CA3AF', maxWidth: 380, marginInline: 'auto', lineHeight: 1.6 }}>
          Este módulo trará métricas específicas de lançamentos pagos: CAC, LTV, ROAS por
          campanha, e atribuição de vendas para criativos do Meta Ads e Google Ads.
        </p>
      </div>
    </div>
  )
}
