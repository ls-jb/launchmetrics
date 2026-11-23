import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { EtiquetaTipo, IconePasta, rotaDoLancamento } from '@/components/shared/EtiquetaTipo'
import { lancamentosService, pastasService } from '@/services/lancamentosService'
import type { Lancamento, Pasta } from '@/types'

/** Faixa no topo do detalhe: mostra a pasta do dashboard e leva direto aos
 * outros dashboards da mesma pasta (ex.: do dash de vendas pro de leads da
 * mesma Black). Não aparece se o dashboard não está em pasta. */
export function DashboardsRelacionados({
  lancamento,
}: {
  lancamento: Pick<Lancamento, 'id' | 'pasta_id'>
}) {
  const { id, pasta_id: pastaId } = lancamento
  const [pasta, setPasta] = useState<Pasta | null>(null)
  const [irmaos, setIrmaos] = useState<Lancamento[]>([])

  useEffect(() => {
    if (!pastaId) {
      setPasta(null)
      setIrmaos([])
      return
    }
    let ativo = true
    Promise.all([pastasService.listar(), lancamentosService.listar()])
      .then(([pastas, lancamentos]) => {
        if (!ativo) return
        setPasta(pastas.find((p) => p.id === pastaId) ?? null)
        setIrmaos(lancamentos.filter((l) => l.pasta_id === pastaId && l.id !== id))
      })
      .catch(() => {
        // Faixa é só um atalho — se falhar, a tela segue sem ela.
      })
    return () => {
      ativo = false
    }
  }, [id, pastaId])

  if (!pastaId || !pasta) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        background: '#7C6AF70D',
        border: '1px solid #7C6AF733',
        borderRadius: 10,
        padding: '8px 12px',
        marginBottom: '1rem',
        fontSize: 12,
      }}
    >
      <IconePasta tamanho={15} />
      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{pasta.nome}</span>
      <span style={{ color: 'var(--text-faint)' }}>
        {irmaos.length > 0 ? '· também nesta pasta:' : '· só este dashboard na pasta por enquanto'}
      </span>
      {irmaos.map((l) => (
        <Link
          key={l.id}
          to={rotaDoLancamento(l)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            textDecoration: 'none',
            color: 'var(--text)',
            background: 'var(--surface)',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            padding: '4px 10px 4px 6px',
            fontWeight: 500,
          }}
        >
          <EtiquetaTipo tipo={l.tipo} />
          {l.nome} →
        </Link>
      ))}
    </div>
  )
}
