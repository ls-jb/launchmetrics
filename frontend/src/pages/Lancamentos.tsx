import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { BadgeStatus } from '@/components/shared/BadgeStatus'
import { Modal } from '@/components/shared/Modal'
import { formatBRL, formatNum, formatPct } from '@/lib/tokens'
import {
  lancamentosService,
  type LancamentoCreatePayload,
} from '@/services/lancamentosService'
import type { Lancamento, StatusLancamento } from '@/types'

export function Lancamentos() {
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [modalAberto, setModalAberto] = useState(false)

  const recarregar = () => {
    setCarregando(true)
    setErro('')
    lancamentosService
      .listar()
      .then(setLancamentos)
      .catch((e) => setErro(extrairErro(e)))
      .finally(() => setCarregando(false))
  }

  useEffect(() => {
    recarregar()
  }, [])

  return (
    <div>
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: '1.5rem',
        }}
      >
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
            Lançamentos
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>
            Acompanhe a captação de leads e métricas por canal
          </p>
        </div>
        <button
          onClick={() => setModalAberto(true)}
          style={{
            background: '#7C6AF7',
            border: 'none',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Novo lançamento
        </button>
      </header>

      {carregando && <EstadoVazio texto="Carregando lançamentos…" />}
      {!carregando && erro && <EstadoErro texto={erro} />}
      {!carregando && !erro && lancamentos.length === 0 && (
        <EstadoVazio texto="Nenhum lançamento ainda. Crie o primeiro." />
      )}

      {!carregando && lancamentos.length > 0 && (
        <div
          style={{
            display: 'grid',
            gap: 14,
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          }}
        >
          {lancamentos.map((l) => (
            <CardLancamento key={l.id} lancamento={l} />
          ))}
        </div>
      )}

      <Modal
        aberto={modalAberto}
        titulo="Novo lançamento"
        onFechar={() => setModalAberto(false)}
      >
        <FormNovoLancamento
          onCancelar={() => setModalAberto(false)}
          onCriado={() => {
            setModalAberto(false)
            recarregar()
          }}
        />
      </Modal>
    </div>
  )
}

function CardLancamento({ lancamento: l }: { lancamento: Lancamento }) {
  const pctLeads = formatPct(l.total_leads, l.meta_leads ?? 0)
  return (
    <Link
      to={`/lancamentos/${l.id}`}
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '1.25rem',
        textDecoration: 'none',
        color: 'inherit',
        display: 'block',
        transition: 'border-color 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-strong)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 12,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text)', maxWidth: '70%' }}>
          {l.nome}
        </h3>
        <BadgeStatus status={l.status} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-faint)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Leads captados
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#3ECFB2' }}>{pctLeads}%</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
            {formatNum(l.total_leads)}
          </span>
          {l.meta_leads ? (
            <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>de {formatNum(l.meta_leads)}</span>
          ) : null}
        </div>
        <div style={{ height: 4, background: 'var(--border)', borderRadius: 99 }}>
          <div
            style={{ height: 4, width: `${pctLeads}%`, background: '#3ECFB2', borderRadius: 99 }}
          />
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          paddingTop: 12,
          borderTop: '1px solid var(--border)',
        }}
      >
        <MetricaInline label="Investimento" valor={formatBRL(l.investimento_total)} />
        <MetricaInline label="CPL" valor={`R$ ${l.cpl.toFixed(2)}`} />
        <MetricaInline label="ROAS" valor={`${l.roas.toFixed(2)}x`} destaque />
      </div>
    </Link>
  )
}

function MetricaInline({
  label,
  valor,
  destaque,
}: {
  label: string
  valor: string
  destaque?: boolean
}) {
  return (
    <div>
      <p
        style={{
          margin: '0 0 3px',
          fontSize: 10,
          color: 'var(--text-faint)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </p>
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: destaque ? '#3ECFB2' : 'var(--text)' }}>
        {valor}
      </p>
    </div>
  )
}

function EstadoVazio({ texto }: { texto: string }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px dashed var(--border-strong)',
        borderRadius: 12,
        padding: '3rem 2rem',
        textAlign: 'center',
        color: 'var(--text-faint)',
        fontSize: 13,
      }}
    >
      {texto}
    </div>
  )
}

function EstadoErro({ texto }: { texto: string }) {
  return (
    <div
      style={{
        background: '#EF444411',
        border: '1px solid #EF444444',
        borderRadius: 12,
        padding: '1rem 1.25rem',
        color: 'var(--text-error)',
        fontSize: 13,
      }}
    >
      Erro ao carregar lançamentos: {texto}
    </div>
  )
}

function FormNovoLancamento({
  onCancelar,
  onCriado,
}: {
  onCancelar: () => void
  onCriado: () => void
}) {
  const [nome, setNome] = useState('')
  const [status, setStatus] = useState<StatusLancamento>('pre_lancamento')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [metaLeads, setMetaLeads] = useState('')
  const [metaRoas, setMetaRoas] = useState('')
  const [metaReceita, setMetaReceita] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const payload: LancamentoCreatePayload = {
      nome,
      status,
      data_inicio: dataInicio || null,
      data_fim: dataFim || null,
      meta_leads: metaLeads ? Number(metaLeads) : null,
      meta_roas: metaRoas ? Number(metaRoas) : null,
      meta_receita: metaReceita ? Number(metaReceita) : null,
    }
    try {
      await lancamentosService.criar(payload)
      onCriado()
    } catch (err) {
      setErro(extrairErro(err))
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
      <Campo
        label="Nome do lançamento"
        tipo="text"
        valor={nome}
        onChange={setNome}
        placeholder="Ex: Método Acelerado — Edição Junho"
        required
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Campo label="Data de início" tipo="date" valor={dataInicio} onChange={setDataInicio} />
        <Campo label="Data de fim" tipo="date" valor={dataFim} onChange={setDataFim} />
      </div>
      <div>
        <label style={rotulo}>Status inicial</label>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as StatusLancamento)}
          style={inputBase}
        >
          <option value="pre_lancamento">Pré-lançamento</option>
          <option value="captacao">Captação</option>
          <option value="carrinho">Carrinho aberto</option>
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <Campo label="Meta de leads" tipo="number" valor={metaLeads} onChange={setMetaLeads} placeholder="5000" />
        <Campo label="Meta de ROAS" tipo="number" valor={metaRoas} onChange={setMetaRoas} placeholder="4.0" step="0.1" />
        <Campo
          label="Meta de receita"
          tipo="number"
          valor={metaReceita}
          onChange={setMetaReceita}
          placeholder="300000"
        />
      </div>

      {erro && (
        <div
          style={{
            background: '#EF444422',
            border: '1px solid #EF444444',
            color: 'var(--text-error)',
            padding: '8px 12px',
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          {erro}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        <button
          type="button"
          onClick={onCancelar}
          disabled={enviando}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-strong)',
            color: 'var(--text-muted)',
            padding: '9px 16px',
            borderRadius: 8,
            fontSize: 13,
            cursor: enviando ? 'not-allowed' : 'pointer',
          }}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={enviando || !nome}
          style={{
            background: enviando ? 'var(--text-dim)' : '#7C6AF7',
            border: 'none',
            color: '#fff',
            padding: '9px 18px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: enviando ? 'not-allowed' : 'pointer',
            opacity: !nome ? 0.6 : 1,
          }}
        >
          {enviando ? 'Criando…' : 'Criar lançamento'}
        </button>
      </div>
    </form>
  )
}

const rotulo: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  color: 'var(--text-muted)',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const inputBase: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface-2)',
  border: '1px solid var(--border-strong)',
  borderRadius: 8,
  padding: '9px 12px',
  color: 'var(--text)',
  fontSize: 13,
  colorScheme: 'dark',
}

function Campo({
  label,
  tipo,
  valor,
  onChange,
  placeholder,
  required,
  step,
}: {
  label: string
  tipo: string
  valor: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  step?: string
}) {
  return (
    <div>
      <label style={rotulo}>{label}</label>
      <input
        type={tipo}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        step={step}
        style={inputBase}
      />
    </div>
  )
}

function extrairErro(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const resp = (err as { response?: { data?: { detail?: string } } }).response
    if (resp?.data?.detail) return resp.data.detail
  }
  if (err instanceof Error) return err.message
  return 'Erro desconhecido'
}
