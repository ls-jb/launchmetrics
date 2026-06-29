import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import { BadgeStatus } from '@/components/shared/BadgeStatus'
import { BarraCanal } from '@/components/shared/BarraCanal'
import { BotaoAtualizar } from '@/components/shared/BotaoAtualizar'
import { EditavelInline } from '@/components/shared/EditavelInline'
import { GraficoVelocidade } from '@/components/shared/GraficoVelocidade'
import { KPICard } from '@/components/shared/KPICard'
import { Modal } from '@/components/shared/Modal'
import { extrairErro } from '@/lib/erro'
import { formatBRL, formatNum, formatPct } from '@/lib/tokens'
import { lancamentosService } from '@/services/lancamentosService'
import { useAuthStore } from '@/store/authStore'
import type { Canal, Lancamento, LeadsPorUtmContent, PontoVelocidade } from '@/types'

export function LancamentoDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [lancamento, setLancamento] = useState<Lancamento | null>(null)
  const [velocidade, setVelocidade] = useState<PontoVelocidade[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [tokenCopiado, setTokenCopiado] = useState(false)
  const [canalSel, setCanalSel] = useState<Canal | null>(null)
  const [atualizando, setAtualizando] = useState(false)
  const [modalMeta, setModalMeta] = useState(false)
  const papel = useAuthStore((s) => s.papel)
  const isAdmin = papel === 'admin'

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!id) return
      if (!silencioso) setCarregando(true)
      else setAtualizando(true)
      setErro('')
      try {
        const [l, v] = await Promise.all([
          lancamentosService.obter(id),
          lancamentosService.velocidadeLeads(id),
        ])
        setLancamento(l)
        setVelocidade(v)
      } catch (e) {
        setErro(extrairErro(e))
      } finally {
        setCarregando(false)
        setAtualizando(false)
      }
    },
    [id],
  )

  useEffect(() => {
    carregar(false)
  }, [carregar])

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

  const salvarMeta = async (
    campo: 'meta_leads' | 'teto_investimento',
    valor: number | null,
  ) => {
    if (!id) return
    const atualizado = await lancamentosService.atualizar(id, { [campo]: valor })
    setLancamento(atualizado)
  }

  const salvarDatas = async (inicio: string | null, fim: string | null) => {
    if (!id) return
    const atualizado = await lancamentosService.atualizar(id, {
      data_inicio: inicio,
      data_fim: fim,
    })
    setLancamento(atualizado)
  }

  const salvarConfigMeta = async (ad: string | null, filtro: string | null) => {
    if (!id) return
    await lancamentosService.atualizar(id, {
      meta_ad_account_id: ad,
      meta_filtro_nome: filtro,
    })
    await carregar(false)
  }

  const sincronizarMeta = async () => {
    if (!id) return
    try {
      const r = await lancamentosService.sincronizarMeta(id)
      if (!r.atualizado) {
        alert(
          'Nada sincronizado. Configure Meta Ads (ad account + filtro) e datas do lançamento, e verifique o token no servidor.',
        )
      } else {
        alert(
          `Investimento Meta Ads atualizado: R$ ${Number(r.investimento).toFixed(2)}.\nPeríodo: ${r.periodo?.[0]} → ${r.periodo?.[1]}`,
        )
      }
      await carregar(false)
    } catch (e) {
      alert(`Erro: ${extrairErro(e)}`)
    }
  }

  const excluirLancamento = async () => {
    if (!id || !lancamento) return
    const ok = confirm(
      `Excluir o lançamento "${lancamento.nome}"?\n\n` +
        `Isso apaga TUDO: canais, leads (${formatNum(lancamento.total_leads)}), ` +
        `investimentos e o token do webhook. Não dá pra desfazer.`,
    )
    if (!ok) return
    try {
      await lancamentosService.deletar(id)
      navigate('/lancamentos')
    } catch (e) {
      alert(`Erro ao excluir: ${extrairErro(e)}`)
    }
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
          <EditorDatas
            inicio={lancamento.data_inicio}
            fim={lancamento.data_fim}
            onSalvar={salvarDatas}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <BotaoAtualizar onClick={() => carregar(true)} atualizando={atualizando} />
          {isAdmin && lancamento.meta_ad_account_id && (
            <button
              onClick={sincronizarMeta}
              title="Puxa o gasto Meta Ads no período do lançamento e atualiza o canal Meta Ads"
              style={{
                background: 'var(--surface)',
                border: '1px solid #3ECFB2',
                color: '#3ECFB2',
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ↻ Sincronizar Meta
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => setModalMeta(true)}
              title="Configurar conta Meta Ads"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border-strong)',
                color: 'var(--text)',
                padding: '8px 14px',
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Meta Ads
            </button>
          )}
          <button
            onClick={excluirLancamento}
            title="Excluir este lançamento"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border-strong)',
              color: '#EF4444',
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'border-color 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#EF4444')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
          >
            Excluir
          </button>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: '1rem',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>Editar metas:</span>
        <EditavelInline
          label="Meta de leads"
          valor={lancamento.meta_leads}
          formatar={(v) => formatNum(v)}
          aoSalvar={(v) => salvarMeta('meta_leads', v)}
        />
        <EditavelInline
          label="Teto de investimento"
          valor={lancamento.teto_investimento}
          formatar={(v) => formatBRL(v)}
          aoSalvar={(v) => salvarMeta('teto_investimento', v)}
        />
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
        <KPICard
          label="Investimento total"
          valor={formatBRL(lancamento.investimento_total)}
          sub={
            lancamento.teto_investimento
              ? `Teto: ${formatBRL(lancamento.teto_investimento)}`
              : 'Sem teto'
          }
          progresso={
            lancamento.teto_investimento
              ? formatPct(
                  lancamento.investimento_total,
                  lancamento.teto_investimento,
                )
              : undefined
          }
          cor="#F59E0B"
        />
        <KPICard label="CPL médio" valor={`R$ ${lancamento.cpl.toFixed(2)}`} cor="#3ECFB2" />
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
        <BarraCanal canais={lancamento.canais} onSelecionar={setCanalSel} />
      </div>

      <Modal
        aberto={canalSel !== null}
        titulo={canalSel ? `Leads por anúncio — ${canalSel.nome}` : ''}
        onFechar={() => setCanalSel(null)}
        largura={640}
      >
        {canalSel && lancamento && (
          <DrillUtmContent lancamentoId={lancamento.id} canal={canalSel} />
        )}
      </Modal>

      <Modal
        aberto={modalMeta}
        titulo="Configurar Meta Ads"
        onFechar={() => setModalMeta(false)}
        largura={480}
      >
        <FormConfigurarMeta
          adInicial={lancamento.meta_ad_account_id}
          filtroInicial={lancamento.meta_filtro_nome}
          onCancelar={() => setModalMeta(false)}
          onSalvar={async (ad, filtro) => {
            await salvarConfigMeta(ad, filtro)
            setModalMeta(false)
          }}
        />
      </Modal>

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

function DrillUtmContent({
  lancamentoId,
  canal,
}: {
  lancamentoId: string
  canal: Canal
}) {
  const [dados, setDados] = useState<LeadsPorUtmContent[] | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    setDados(null)
    setErro('')
    lancamentosService
      .leadsPorUtmContent(lancamentoId, canal.id)
      .then(setDados)
      .catch((e) => setErro(extrairErro(e)))
  }, [lancamentoId, canal.id])

  if (erro) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-error)' }}>{erro}</p>
    )
  }
  if (!dados) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>Carregando…</p>
    )
  }
  if (dados.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>
        Nenhum lead deste canal ainda.
      </p>
    )
  }

  const total = dados.reduce((a, d) => a + d.quantidade, 0)
  const max = dados[0].quantidade

  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-faint)' }}>
        Total: {formatNum(total)} leads — agrupado por <code>utm_content</code>.
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        {dados.map((d) => (
          <div key={d.utm_content}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '70%',
                }}
                title={d.utm_content}
              >
                {d.utm_content}
              </span>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                {formatNum(d.quantidade)} leads
              </span>
            </div>
            <div style={{ height: 4, background: 'var(--border)', borderRadius: 99 }}>
              <div
                style={{
                  height: 4,
                  width: `${Math.round((d.quantidade / max) * 100)}%`,
                  background: '#7C6AF7',
                  borderRadius: 99,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================
// Editor inline das datas (data_inicio / data_fim do lançamento)
// ============================================================
function EditorDatas({
  inicio,
  fim,
  onSalvar,
}: {
  inicio: string | null
  fim: string | null
  onSalvar: (inicio: string | null, fim: string | null) => Promise<void>
}) {
  const [editando, setEditando] = useState(false)
  const [valInicio, setValInicio] = useState(inicio ?? '')
  const [valFim, setValFim] = useState(fim ?? '')
  const [salvando, setSalvando] = useState(false)

  const abrir = () => {
    setValInicio(inicio ?? '')
    setValFim(fim ?? '')
    setEditando(true)
  }

  const cancelar = () => {
    setEditando(false)
  }

  const salvar = async () => {
    const novoInicio = valInicio || null
    const novoFim = valFim || null
    if (novoInicio === inicio && novoFim === fim) {
      setEditando(false)
      return
    }
    setSalvando(true)
    try {
      await onSalvar(novoInicio, novoFim)
      setEditando(false)
    } finally {
      setSalvando(false)
    }
  }

  if (!editando) {
    return (
      <button
        onClick={abrir}
        title="Editar período do lançamento"
        style={{
          background: 'transparent',
          border: 'none',
          padding: 0,
          margin: 0,
          color: 'var(--text-faint)',
          fontSize: 13,
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {formatarData(inicio)} → {formatarData(fim)}
        <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>✎</span>
      </button>
    )
  }

  const inputDate: React.CSSProperties = {
    background: 'var(--surface-2)',
    border: '1px solid var(--border-strong)',
    borderRadius: 6,
    padding: '4px 8px',
    color: 'var(--text)',
    fontSize: 12,
    colorScheme: 'dark',
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <input
        type="date"
        value={valInicio}
        onChange={(e) => setValInicio(e.target.value)}
        disabled={salvando}
        style={inputDate}
      />
      <span style={{ color: 'var(--text-faint)', fontSize: 13 }}>→</span>
      <input
        type="date"
        value={valFim}
        onChange={(e) => setValFim(e.target.value)}
        disabled={salvando}
        style={inputDate}
      />
      <button
        onClick={salvar}
        disabled={salvando}
        style={{
          background: '#7C6AF7',
          border: 'none',
          color: '#fff',
          borderRadius: 6,
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {salvando ? '…' : 'Salvar'}
      </button>
      <button
        onClick={cancelar}
        disabled={salvando}
        style={{
          background: 'transparent',
          border: '1px solid var(--border-strong)',
          color: 'var(--text-muted)',
          borderRadius: 6,
          padding: '3px 8px',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        ×
      </button>
    </span>
  )
}


// ============================================================
// Modal: configurar Meta Ads (ad_account_id + filtro)
// ============================================================
function FormConfigurarMeta({
  adInicial,
  filtroInicial,
  onCancelar,
  onSalvar,
}: {
  adInicial: string | null
  filtroInicial: string | null
  onCancelar: () => void
  onSalvar: (ad: string | null, filtro: string | null) => Promise<void>
}) {
  const [ad, setAd] = useState(adInicial ?? '')
  const [filtro, setFiltro] = useState(filtroInicial ?? '')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      await onSalvar(ad.trim() || null, filtro.trim() || null)
    } catch (err) {
      setErro(extrairErro(err))
      setEnviando(false)
    }
  }

  const inputBase: React.CSSProperties = {
    width: '100%',
    background: 'var(--surface-2)',
    border: '1px solid var(--border-strong)',
    borderRadius: 8,
    padding: '9px 12px',
    color: 'var(--text)',
    fontSize: 13,
  }

  return (
    <form onSubmit={enviar} style={{ display: 'grid', gap: 14 }}>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-faint)' }}>
        Vincule esse lançamento a uma Ad Account da Meta. O sync pega o
        gasto das campanhas que tiverem o filtro no nome, no período
        (data_inicio → data_fim) do lançamento, e atualiza o canal
        “Meta Ads”.
      </p>
      <div>
        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ad Account ID</label>
        <input
          type="text"
          value={ad}
          onChange={(e) => setAd(e.target.value)}
          placeholder="Ex: 628263058826646"
          style={inputBase}
        />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Filtro de campanhas (substring no nome)</label>
        <input
          type="text"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="Ex: [SPT]"
          style={inputBase}
        />
      </div>

      {erro && (
        <div
          style={{
            background: '#EF444411',
            border: '1px solid #EF444444',
            color: 'var(--text-error)',
            padding: '8px 12px',
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          {erro}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button
          type="button"
          onClick={onCancelar}
          disabled={enviando}
          style={{
            background: 'transparent',
            border: '1px solid var(--border-strong)',
            color: 'var(--text-muted)',
            padding: '10px 14px',
            borderRadius: 8,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={enviando}
          style={{
            background: '#7C6AF7',
            border: 'none',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {enviando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  )
}
