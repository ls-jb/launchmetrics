import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { BadgeStatus } from '@/components/shared/BadgeStatus'
import { BarraCanal } from '@/components/shared/BarraCanal'
import { GraficoVelocidade } from '@/components/shared/GraficoVelocidade'
import { KPICard } from '@/components/shared/KPICard'
import { formatBRL, formatNum, formatPct } from '@/lib/tokens'
import { lancamentosService } from '@/services/lancamentosService'
import type { Canal, Lancamento, PontoVelocidade } from '@/types'

export function LancamentoDetalhe() {
  const { id } = useParams<{ id: string }>()
  const [lancamento, setLancamento] = useState<Lancamento | null>(null)
  const [velocidade, setVelocidade] = useState<PontoVelocidade[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [tokenCopiado, setTokenCopiado] = useState(false)

  useEffect(() => {
    if (!id) return
    setCarregando(true)
    setErro('')
    Promise.all([
      lancamentosService.obter(id),
      lancamentosService.velocidadeLeads(id),
    ])
      .then(([l, v]) => {
        setLancamento(l)
        setVelocidade(v)
      })
      .catch((e) => setErro(extrairErro(e)))
      .finally(() => setCarregando(false))
  }, [id])

  const velocidadeFormatada = useMemo(
    () =>
      velocidade.map((p) => ({
        dia: p.dia.slice(8, 10) + '/' + p.dia.slice(5, 7),
        leads: p.leads,
      })),
    [velocidade],
  )

  if (carregando) {
    return <Mensagem texto="Carregando lançamento…" />
  }
  if (erro) {
    return <Mensagem texto={`Erro ao carregar: ${erro}`} tipo="erro" />
  }
  if (!lancamento) {
    return <Mensagem texto="Lançamento não encontrado." />
  }

  const webhookUrl = `${import.meta.env.VITE_API_URL}/api/webhooks/ghl/${lancamento.webhook_token}`

  const copiarUrl = () => {
    navigator.clipboard.writeText(webhookUrl)
    setTokenCopiado(true)
    setTimeout(() => setTokenCopiado(false), 1800)
  }

  const aposSalvarCanal = (atualizado: Lancamento) => {
    setLancamento(atualizado)
  }

  return (
    <div>
      <Link
        to="/lancamentos"
        style={{
          color: '#7C6AF7',
          fontSize: 13,
          textDecoration: 'none',
          display: 'inline-block',
          marginBottom: 14,
        }}
      >
        ← Voltar para lançamentos
      </Link>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
              {lancamento.nome}
            </h1>
            <BadgeStatus status={lancamento.status} />
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>
            {formatarData(lancamento.data_inicio)} → {formatarData(lancamento.data_fim)}
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: '1.5rem',
        }}
      >
        <KPICard
          label="Leads captados"
          valor={formatNum(lancamento.total_leads)}
          sub={lancamento.meta_leads ? `Meta: ${formatNum(lancamento.meta_leads)}` : 'Sem meta'}
          progresso={
            lancamento.meta_leads
              ? formatPct(lancamento.total_leads, lancamento.meta_leads)
              : undefined
          }
          cor="#3ECFB2"
        />
        <KPICard label="Investimento total" valor={formatBRL(lancamento.investimento_total)} />
        <KPICard label="CPL médio" valor={`R$ ${lancamento.cpl.toFixed(2)}`} cor="#3ECFB2" />
        <KPICard
          label="ROAS"
          valor={`${lancamento.roas.toFixed(2)}x`}
          sub={lancamento.meta_roas ? `Meta: ${lancamento.meta_roas.toFixed(1)}x` : 'Sem meta'}
          progresso={
            lancamento.meta_roas
              ? formatPct(lancamento.roas, lancamento.meta_roas)
              : undefined
          }
          cor="#F59E0B"
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.4fr 1fr',
          gap: 14,
          marginBottom: '1.5rem',
        }}
      >
        {velocidadeFormatada.length > 0 ? (
          <GraficoVelocidade dados={velocidadeFormatada} />
        ) : (
          <CardVazio
            titulo="Leads por dia"
            mensagem="Ainda não chegaram leads pelo webhook. Configure o GHL com a URL ao lado."
          />
        )}
        <BarraCanal canais={lancamento.canais} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <EditorInvestimento
          lancamentoId={lancamento.id}
          canais={lancamento.canais}
          aposSalvar={aposSalvarCanal}
        />
        <CardWebhook url={webhookUrl} copiado={tokenCopiado} onCopiar={copiarUrl} />
      </div>
    </div>
  )
}

function EditorInvestimento({
  lancamentoId,
  canais,
  aposSalvar,
}: {
  lancamentoId: string
  canais: Canal[]
  aposSalvar: (l: Lancamento) => void
}) {
  // valores locais para os inputs (string) — separados dos canais persistidos
  const [valores, setValores] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState<string | null>(null)

  useEffect(() => {
    const inicial: Record<string, string> = {}
    canais.forEach((c) => {
      inicial[c.id] = String(c.investimento)
    })
    setValores(inicial)
  }, [canais])

  const onChange = (canalId: string, valor: string) => {
    setValores((prev) => ({ ...prev, [canalId]: valor }))
  }

  const salvar = async (canalId: string) => {
    const original = canais.find((c) => c.id === canalId)
    if (!original) return
    const novo = Number(valores[canalId])
    if (Number.isNaN(novo) || novo < 0) return
    if (novo === Number(original.investimento)) return

    setSalvando(canalId)
    try {
      const atualizado = await lancamentosService.atualizarCanais(lancamentoId, [
        { id: canalId, investimento: novo },
      ])
      aposSalvar(atualizado)
    } catch {
      // reverte ao valor original em caso de erro
      setValores((prev) => ({ ...prev, [canalId]: String(original.investimento) }))
    } finally {
      setSalvando(null)
    }
  }

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '1.25rem',
      }}
    >
      <p style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
        Investimento por canal
      </p>
      <div style={{ display: 'grid', gap: 12 }}>
        {canais.map((c) => (
          <div
            key={c.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <span style={{ fontSize: 13, color: 'var(--text-strong)', flex: 1 }}>{c.nome}</span>
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>{formatNum(c.leads)} leads</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>R$</span>
              <input
                type="number"
                step="0.01"
                value={valores[c.id] ?? ''}
                onChange={(e) => onChange(c.id, e.target.value)}
                onBlur={() => salvar(c.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                }}
                disabled={salvando === c.id}
                style={{
                  width: 100,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 6,
                  padding: '6px 10px',
                  color: 'var(--text)',
                  fontSize: 13,
                  textAlign: 'right',
                  opacity: salvando === c.id ? 0.5 : 1,
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--text-faint)' }}>
        Clique fora do campo ou pressione Enter para salvar.
      </p>
    </div>
  )
}

function CardWebhook({
  url,
  copiado,
  onCopiar,
}: {
  url: string
  copiado: boolean
  onCopiar: () => void
}) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '1.25rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
          Webhook do Go High Level
        </p>
        <span
          style={{
            fontSize: 10,
            color: '#3ECFB2',
            background: '#3ECFB222',
            padding: '2px 8px',
            borderRadius: 99,
            fontWeight: 600,
            letterSpacing: '0.04em',
          }}
        >
          ATIVO
        </span>
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-faint)' }}>
        Configure esta URL no GHL como destino do webhook de Contact Created:
      </p>
      <div
        style={{
          background: 'var(--surface-2)',
          border: '1px solid var(--border-strong)',
          borderRadius: 8,
          padding: '10px 12px',
          fontFamily: 'monospace',
          fontSize: 12,
          color: 'var(--text-strong)',
          wordBreak: 'break-all',
          marginBottom: 10,
        }}
      >
        {url}
      </div>
      <button
        onClick={onCopiar}
        style={{
          background: copiado ? '#3ECFB2' : 'var(--border)',
          border: '1px solid var(--border-strong)',
          color: copiado ? 'var(--bg)' : 'var(--text-strong)',
          padding: '8px 14px',
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        {copiado ? '✓ Copiado!' : 'Copiar URL'}
      </button>
    </div>
  )
}

function CardVazio({ titulo, mensagem }: { titulo: string; mensagem: string }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px dashed var(--border-strong)',
        borderRadius: 12,
        padding: '1.25rem',
        minHeight: 240,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <p style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>{titulo}</p>
      <div
        style={{
          flex: 1,
          display: 'grid',
          placeItems: 'center',
          color: 'var(--text-faint)',
          fontSize: 13,
          textAlign: 'center',
          padding: '0 1rem',
        }}
      >
        {mensagem}
      </div>
    </div>
  )
}

function Mensagem({ texto, tipo = 'info' }: { texto: string; tipo?: 'info' | 'erro' }) {
  return (
    <div
      style={{
        background: tipo === 'erro' ? '#EF444411' : 'var(--surface)',
        border: `1px solid ${tipo === 'erro' ? '#EF444444' : 'var(--border)'}`,
        borderRadius: 12,
        padding: '3rem 2rem',
        textAlign: 'center',
        color: tipo === 'erro' ? 'var(--text-error)' : 'var(--text-faint)',
        fontSize: 13,
      }}
    >
      {texto}
    </div>
  )
}

function formatarData(data: string | null): string {
  if (!data) return '—'
  return data.slice(8, 10) + '/' + data.slice(5, 7) + '/' + data.slice(0, 4)
}

function extrairErro(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const resp = (err as { response?: { data?: { detail?: string } } }).response
    if (resp?.data?.detail) return resp.data.detail
  }
  if (err instanceof Error) return err.message
  return 'Erro desconhecido'
}
