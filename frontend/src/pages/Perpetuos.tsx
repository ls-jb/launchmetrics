import { format } from 'date-fns'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { BotaoAtualizar } from '@/components/shared/BotaoAtualizar'
import { FiltroData } from '@/components/shared/FiltroData'
import { GraficoPerpetuoDia } from '@/components/shared/GraficoPerpetuoDia'
import { KPICard } from '@/components/shared/KPICard'
import { Modal } from '@/components/shared/Modal'
import { extrairErro } from '@/lib/erro'
import { formatBRL, formatNum } from '@/lib/tokens'
import {
  perpetuosService,
  type NovoPerpetuoPayload,
} from '@/services/perpetuosService'
import { useAuthStore } from '@/store/authStore'
import type {
  OfertaDisponivel,
  Perpetuo,
  PerpetuoAporte,
  PerpetuoCompleto,
  PerpetuoOfertaDetalhe,
  PontoInvestimentoDia,
  PontoVendaCategoriaPerp,
} from '@/types'

// ============================================================
// Página: lista de perpétuos
// ============================================================
export function Perpetuos() {
  const papel = useAuthStore((s) => s.papel)
  const isAdmin = papel === 'admin'

  const [perps, setPerps] = useState<Perpetuo[]>([])
  const [carregandoLista, setCarregandoLista] = useState(true)
  const [perpetuoId, setPerpetuoId] = useState<string | null>(null)
  const [erro, setErro] = useState('')
  const [modalNovo, setModalNovo] = useState(false)

  const recarregarLista = useCallback(() => {
    setCarregandoLista(true)
    setErro('')
    perpetuosService
      .listar()
      .then(setPerps)
      .catch((e) => setErro(extrairErro(e)))
      .finally(() => setCarregandoLista(false))
  }, [])

  useEffect(() => {
    recarregarLista()
  }, [recarregarLista])

  if (!perpetuoId) {
    return (
      <div>
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            marginBottom: '1.5rem',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
              Perpétuos
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>
              Produtos vendidos continuamente — métricas com filtro por período
            </p>
          </div>
          {isAdmin && (
            <button onClick={() => setModalNovo(true)} style={botaoPrimario}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Novo perpétuo
            </button>
          )}
        </header>

        {erro && <Aviso texto={`Erro: ${erro}`} />}

        {!carregandoLista && perps.length === 0 && (
          <CardVazio
            titulo="Nenhum perpétuo ainda"
            mensagem={isAdmin ? 'Clique em "+ Novo perpétuo" pra cadastrar o primeiro.' : 'Peça a um admin pra cadastrar um perpétuo.'}
          />
        )}

        <div style={{ display: 'grid', gap: 10 }}>
          {perps.map((p) => (
            <button
              key={p.id}
              onClick={() => setPerpetuoId(p.id)}
              style={cardClicavel}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#7C6AF7')}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                  {p.nome}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>
                  Desde {fmtData(p.data_inicio)}
                  {p.meta_ad_account_id ? ` · Meta Ads: ${p.meta_ad_account_id}` : ''}
                </p>
              </div>
              <span style={{ fontSize: 18, color: 'var(--text-dim)' }}>›</span>
            </button>
          ))}
        </div>

        <Modal
          aberto={modalNovo}
          titulo="Novo perpétuo"
          onFechar={() => setModalNovo(false)}
          largura={520}
        >
          <FormNovoPerpetuo
            onCancelar={() => setModalNovo(false)}
            onCriou={(novo) => {
              setModalNovo(false)
              recarregarLista()
              setPerpetuoId(novo.id)
            }}
          />
        </Modal>
      </div>
    )
  }

  return (
    <DetalhePerpetuo
      perpetuoId={perpetuoId}
      isAdmin={isAdmin}
      onVoltar={() => {
        setPerpetuoId(null)
        recarregarLista()
      }}
    />
  )
}

// ============================================================
// Tela 2 — Detalhe do perpétuo
// ============================================================
function DetalhePerpetuo({
  perpetuoId,
  isAdmin,
  onVoltar,
}: {
  perpetuoId: string
  isAdmin: boolean
  onVoltar: () => void
}) {
  const [completo, setCompleto] = useState<PerpetuoCompleto | null>(null)
  const [vendasDia, setVendasDia] = useState<PontoVendaCategoriaPerp[]>([])
  const [investDia, setInvestDia] = useState<PontoInvestimentoDia[]>([])
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [erro, setErro] = useState('')

  // Estado do filtro de data — só commita quando muda
  const [inicio, setInicio] = useState<string | undefined>(undefined)
  const [fim, setFim] = useState<string | undefined>(undefined)

  // Modais
  const [modalOferta, setModalOferta] = useState(false)
  const [modalAportes, setModalAportes] = useState(false)
  const [modalMeta, setModalMeta] = useState(false)

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!silencioso) setCarregando(true)
      else setAtualizando(true)
      try {
        const [c, v, i] = await Promise.all([
          perpetuosService.obter(perpetuoId, inicio, fim),
          perpetuosService.vendasPorDia(perpetuoId, inicio, fim),
          perpetuosService.investimentoPorDia(perpetuoId, inicio, fim),
        ])
        setCompleto(c)
        setVendasDia(v)
        setInvestDia(i)
      } catch (e) {
        if (!silencioso) setErro(extrairErro(e))
      } finally {
        if (!silencioso) setCarregando(false)
        else setAtualizando(false)
      }
    },
    [perpetuoId, inicio, fim],
  )

  useEffect(() => {
    carregar(false)
  }, [carregar])

  const adicionarAporte = async (
    dia: string,
    valor: number,
    descricao: string | null,
  ) => {
    await perpetuosService.adicionarAporte(perpetuoId, { dia, valor, descricao })
    await carregar(false)
  }

  const removerAporte = async (id: string) => {
    if (!confirm('Remover esse aporte?')) return
    try {
      await perpetuosService.removerAporte(id)
      await carregar(false)
    } catch (e) {
      alert(extrairErro(e))
    }
  }

  const removerOferta = async (id: string) => {
    if (!confirm('Remover essa oferta do perpétuo?')) return
    try {
      await perpetuosService.removerOferta(id)
      await carregar(false)
    } catch (e) {
      alert(extrairErro(e))
    }
  }

  const removerPerpetuo = async () => {
    if (!completo) return
    if (
      !confirm(
        `Remover o perpétuo "${completo.perpetuo.nome}"?\n\nIsso apaga as ofertas e os aportes. As vendas reais continuam intactas.`,
      )
    )
      return
    try {
      await perpetuosService.remover(perpetuoId)
      onVoltar()
    } catch (e) {
      alert(extrairErro(e))
    }
  }

  const salvarMeta = async (ad: string | null, filtro: string | null) => {
    await perpetuosService.atualizar(perpetuoId, {
      meta_ad_account_id: ad,
      meta_filtro_nome: filtro,
    })
    await carregar(false)
  }

  const sincronizarMeta = async () => {
    try {
      const r = await perpetuosService.sincronizarMeta(perpetuoId, 3)
      if (r.dias === 0) {
        alert(
          'Nada sincronizado. Configure Meta Ads (ad account + filtro) e verifique o token no servidor.',
        )
      } else {
        alert(
          `Sincronizado: ${r.dias} dia(s), total R$ ${Number(r.total).toFixed(2)}.\nPeríodo: ${r.periodo?.[0]} → ${r.periodo?.[1]}`,
        )
      }
      await carregar(false)
    } catch (e) {
      alert(`Erro: ${extrairErro(e)}`)
    }
  }

  if (carregando && !completo) {
    return <p style={textoMudo}>Carregando…</p>
  }
  if (erro) {
    return <Aviso texto={`Erro: ${erro}`} />
  }
  if (!completo) return null

  const receita = Number(completo.receita_total)
  const invest = Number(completo.investimento_total)
  const qtd = completo.quantidade_total
  const roas = invest > 0 ? receita / invest : 0

  return (
    <div>
      <button onClick={onVoltar} style={botaoVoltar}>
        ‹ Voltar aos perpétuos
      </button>

      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>
            {completo.perpetuo.nome}
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>
            Desde {fmtData(completo.perpetuo.data_inicio)}
            {completo.perpetuo.meta_ad_account_id ? (
              <>
                {' · '}Meta Ads {completo.perpetuo.meta_ad_account_id}
                {completo.perpetuo.meta_filtro_nome
                  ? ` (filtro: "${completo.perpetuo.meta_filtro_nome}")`
                  : ''}
              </>
            ) : null}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <BotaoAtualizar onClick={() => carregar(true)} atualizando={atualizando} />
          {isAdmin && (
            <>
              <button onClick={() => setModalAportes(true)} style={botaoSecundario}>
                + Aporte
              </button>
              <button onClick={() => setModalOferta(true)} style={botaoSecundario}>
                + Oferta
              </button>
              {completo.perpetuo.meta_ad_account_id && (
                <button
                  onClick={sincronizarMeta}
                  style={{ ...botaoSecundario, borderColor: '#3ECFB2', color: '#3ECFB2' }}
                  title="Puxa o gasto Meta Ads dos últimos 3 dias e atualiza os aportes"
                >
                  ↻ Sincronizar Meta
                </button>
              )}
              <button onClick={() => setModalMeta(true)} style={botaoSecundario}>
                Meta Ads
              </button>
              <button onClick={removerPerpetuo} style={{ ...botaoSecundario, color: '#EF4444' }}>
                Remover
              </button>
            </>
          )}
        </div>
      </header>

      {/* Filtro de data */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
        }}
      >
        <FiltroData
          inicioInicial={completo.inicio}
          fimInicial={completo.fim}
          onChange={(i, f) => {
            setInicio(i)
            setFim(f)
          }}
        />
      </div>

      {/* 4 KPIs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
          marginBottom: '1.5rem',
        }}
      >
        <KPICard label="Investimento" valor={formatBRL(invest)} cor="#F59E0B" />
        <KPICard label="Faturamento" valor={formatBRL(receita)} cor="#3ECFB2" />
        <KPICard label="Vendas" valor={formatNum(qtd)} cor="var(--text)" />
        <KPICard
          label="ROAS"
          valor={invest > 0 ? `${roas.toFixed(2)}x` : '—'}
          cor={invest > 0 ? '#7C6AF7' : 'var(--text-dim)'}
        />
      </div>

      {/* Lista de ofertas */}
      <h3 style={tituloSecao}>Ofertas</h3>
      {completo.ofertas.length === 0 ? (
        <CardVazio
          titulo="Nenhuma oferta cadastrada"
          mensagem={
            isAdmin
              ? 'Clique em "+ Oferta" pra adicionar. Cada oferta casa com vendas.oferta_codigo.'
              : 'Peça a um admin pra cadastrar ofertas.'
          }
        />
      ) : (
        <div
          style={{
            display: 'grid',
            gap: 12,
            gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
            marginBottom: '1.5rem',
          }}
        >
          {completo.ofertas.map((o) => (
            <CardOferta key={o.id} detalhe={o} isAdmin={isAdmin} onRemover={removerOferta} />
          ))}
        </div>
      )}

      {/* Gráfico diário */}
      <h3 style={tituloSecao}>Vendas por dia × categoria</h3>
      <div style={{ marginBottom: '1.5rem' }}>
        <GraficoPerpetuoDia vendas={vendasDia} investimento={investDia} />
      </div>

      <Modal
        aberto={modalOferta}
        titulo="Adicionar oferta ao perpétuo"
        onFechar={() => setModalOferta(false)}
        largura={620}
      >
        <FormAdicionarOferta
          perpetuoId={perpetuoId}
          jaCadastrados={new Set(completo.ofertas.map((o) => o.oferta_codigo))}
          onCancelar={() => setModalOferta(false)}
          onCriou={() => {
            setModalOferta(false)
            carregar(false)
          }}
        />
      </Modal>

      <Modal
        aberto={modalAportes}
        titulo="Aportes de investimento"
        onFechar={() => setModalAportes(false)}
        largura={640}
      >
        <GerenciadorAportes
          aportes={completo.aportes}
          onAdicionar={adicionarAporte}
          onRemover={removerAporte}
        />
      </Modal>

      <Modal
        aberto={modalMeta}
        titulo="Configurar Meta Ads"
        onFechar={() => setModalMeta(false)}
        largura={480}
      >
        <FormConfigurarMeta
          adInicial={completo.perpetuo.meta_ad_account_id}
          filtroInicial={completo.perpetuo.meta_filtro_nome}
          onCancelar={() => setModalMeta(false)}
          onSalvar={async (ad, filtro) => {
            await salvarMeta(ad, filtro)
            setModalMeta(false)
          }}
        />
      </Modal>
    </div>
  )
}

// ============================================================
// Card de uma oferta cadastrada
// ============================================================
function CardOferta({
  detalhe,
  isAdmin,
  onRemover,
}: {
  detalhe: PerpetuoOfertaDetalhe
  isAdmin: boolean
  onRemover: (id: string) => void
}) {
  const cpv =
    detalhe.quantidade > 0 ? Number(detalhe.receita) / detalhe.quantidade : 0
  const corCategoria: Record<string, string> = {
    Principal: '#7C6AF7',
    'Order Bump': '#F59E0B',
    Upsell: '#60A5FA',
    Downsell: '#EC4899',
    Outros: '#6B7280',
  }
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '1rem 1.25rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span
            style={{
              display: 'inline-block',
              fontSize: 10,
              fontWeight: 700,
              color: corCategoria[detalhe.categoria] || '#6B7280',
              background: `${corCategoria[detalhe.categoria] || '#6B7280'}22`,
              padding: '2px 8px',
              borderRadius: 99,
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {detalhe.categoria}
          </span>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {detalhe.oferta_nome || detalhe.oferta_codigo}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-faint)' }}>
            cód: {detalhe.oferta_codigo}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => onRemover(detalhe.id)}
            title="Remover oferta"
            style={botaoIconeRemover}
          >
            ×
          </button>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 10,
          marginTop: 10,
          paddingTop: 10,
          borderTop: '1px solid var(--border)',
        }}
      >
        <MetricaInline label="Vendas" valor={formatNum(detalhe.quantidade)} />
        <MetricaInline label="Receita" valor={formatBRL(detalhe.receita)} />
        <MetricaInline label="Ticket méd." valor={`R$ ${cpv.toFixed(2)}`} />
      </div>
    </div>
  )
}

function MetricaInline({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p
        style={{
          margin: 0,
          fontSize: 10,
          color: 'var(--text-faint)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
        }}
      >
        {label}
      </p>
      <p style={{ margin: '2px 0 0', fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
        {valor}
      </p>
    </div>
  )
}

// ============================================================
// Form: novo perpétuo (sem produtos — agora cadastra ofertas depois)
// ============================================================
function FormNovoPerpetuo({
  onCancelar,
  onCriou,
}: {
  onCancelar: () => void
  onCriou: (p: Perpetuo) => void
}) {
  const [nome, setNome] = useState('')
  const [dataInicio, setDataInicio] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    const payload: NovoPerpetuoPayload = { nome, data_inicio: dataInicio }
    try {
      const novo = await perpetuosService.criar(payload)
      onCriou(novo)
    } catch (err) {
      setErro(extrairErro(err))
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={enviar} style={{ display: 'grid', gap: 14 }}>
      <Campo label="Nome do perpétuo" tipo="text" valor={nome} onChange={setNome} placeholder="Ex: Protocolo Antidor" required />
      <Campo label="Data de início" tipo="date" valor={dataInicio} onChange={setDataInicio} required />
      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-faint)' }}>
        Depois de criar, você adiciona as ofertas e os aportes no detalhe.
      </p>

      {erro && <Aviso texto={erro} />}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onCancelar} disabled={enviando} style={botaoSecundarioModal}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando || !nome} style={{ ...botaoPrimario, opacity: !nome ? 0.6 : 1 }}>
          {enviando ? 'Criando…' : 'Criar perpétuo'}
        </button>
      </div>
    </form>
  )
}

// ============================================================
// Form: adicionar oferta (lista de ofertas disponíveis das vendas)
// ============================================================
function FormAdicionarOferta({
  perpetuoId,
  jaCadastrados,
  onCancelar,
  onCriou,
}: {
  perpetuoId: string
  jaCadastrados: Set<string>
  onCancelar: () => void
  onCriou: () => void
}) {
  const [disponiveis, setDisponiveis] = useState<OfertaDisponivel[]>([])
  const [filtro, setFiltro] = useState('')
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    perpetuosService.ofertasDisponiveis().then(setDisponiveis).catch(() => setDisponiveis([]))
  }, [])

  const filtrados = useMemo(() => {
    const q = filtro.toLowerCase()
    return disponiveis.filter((o) => {
      if (jaCadastrados.has(o.oferta_codigo)) return false
      return (
        o.oferta_codigo.toLowerCase().includes(q) ||
        (o.oferta_nome || '').toLowerCase().includes(q) ||
        (o.produto || '').toLowerCase().includes(q)
      )
    })
  }, [disponiveis, filtro, jaCadastrados])

  const alternar = (codigo: string) => {
    setSelecionados((prev) => {
      const novo = new Set(prev)
      if (novo.has(codigo)) novo.delete(codigo)
      else novo.add(codigo)
      return novo
    })
  }

  const enviar = async () => {
    if (selecionados.size === 0) return
    setErro('')
    setEnviando(true)
    try {
      for (const cod of selecionados) {
        const oferta = disponiveis.find((o) => o.oferta_codigo === cod)
        await perpetuosService.adicionarOferta(perpetuoId, {
          oferta_codigo: cod,
          oferta_nome: oferta?.oferta_nome ?? null,
        })
      }
      onCriou()
    } catch (err) {
      setErro(extrairErro(err))
      setEnviando(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <input
        type="text"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        placeholder="Filtrar por nome / código / produto…"
        style={inputBase}
        autoFocus
      />
      <div
        style={{
          maxHeight: 320,
          overflowY: 'auto',
          border: '1px solid var(--border-strong)',
          borderRadius: 8,
          padding: 6,
          background: 'var(--surface-2)',
        }}
      >
        {filtrados.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-faint)', padding: 12, textAlign: 'center' }}>
            {disponiveis.length === 0 ? 'Carregando…' : 'Nenhuma oferta disponível.'}
          </p>
        ) : (
          filtrados.map((o) => (
            <label
              key={o.oferta_codigo}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                padding: '6px 8px',
                fontSize: 13,
                color: 'var(--text)',
                cursor: 'pointer',
                borderRadius: 4,
                background: selecionados.has(o.oferta_codigo) ? 'var(--border)' : 'transparent',
              }}
            >
              <input
                type="checkbox"
                checked={selecionados.has(o.oferta_codigo)}
                onChange={() => alternar(o.oferta_codigo)}
                style={{ marginTop: 3 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 500 }}>{o.oferta_nome || '(sem nome)'}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-faint)' }}>
                  {o.produto || '—'} · cód {o.oferta_codigo}
                </p>
              </div>
            </label>
          ))
        )}
      </div>

      {erro && <Aviso texto={erro} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
          {selecionados.size} selecionadas
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onCancelar} disabled={enviando} style={botaoSecundarioModal}>
            Cancelar
          </button>
          <button
            onClick={enviar}
            disabled={enviando || selecionados.size === 0}
            style={{ ...botaoPrimario, opacity: selecionados.size === 0 ? 0.6 : 1 }}
          >
            {enviando ? 'Adicionando…' : 'Adicionar selecionadas'}
          </button>
        </div>
      </div>
    </div>
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

  return (
    <form onSubmit={enviar} style={{ display: 'grid', gap: 14 }}>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-faint)' }}>
        Vincule esse perpétuo a uma Ad Account da Meta. Aportes serão puxados
        automaticamente das campanhas que tiverem o filtro no nome.
      </p>
      <Campo
        label="Ad Account ID"
        tipo="text"
        valor={ad}
        onChange={setAd}
        placeholder="Ex: 628263058826646"
      />
      <Campo
        label="Filtro de campanhas (substring no nome)"
        tipo="text"
        valor={filtro}
        onChange={setFiltro}
        placeholder="Ex: [PAR]"
      />

      {erro && <Aviso texto={erro} />}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" onClick={onCancelar} disabled={enviando} style={botaoSecundarioModal}>
          Cancelar
        </button>
        <button type="submit" disabled={enviando} style={botaoPrimario}>
          {enviando ? 'Salvando…' : 'Salvar'}
        </button>
      </div>
    </form>
  )
}

// ============================================================
// Modal de aportes — form + lista
// ============================================================
function GerenciadorAportes({
  aportes,
  onAdicionar,
  onRemover,
}: {
  aportes: PerpetuoAporte[]
  onAdicionar: (dia: string, valor: number, descricao: string | null) => Promise<void>
  onRemover: (id: string) => void
}) {
  const [dia, setDia] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [valor, setValor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    const v = Number(valor)
    if (Number.isNaN(v) || v < 0) {
      setErro('Valor inválido.')
      return
    }
    setEnviando(true)
    try {
      await onAdicionar(dia, v, descricao.trim() || null)
      setValor('')
      setDescricao('')
    } catch (err) {
      setErro(extrairErro(err))
    } finally {
      setEnviando(false)
    }
  }

  const total = aportes.reduce((acc, a) => acc + Number(a.valor), 0)

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <form onSubmit={enviar} style={{ display: 'grid', gap: 10 }}>
        <p style={subtituloModal}>Novo aporte</p>
        <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: 8 }}>
          <input type="date" value={dia} onChange={(e) => setDia(e.target.value)} required style={inputBase} />
          <input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Valor (R$)" required style={inputBase} />
          <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Descrição (opcional)" style={inputBase} />
        </div>
        {erro && <Aviso texto={erro} />}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" disabled={enviando || !valor} style={{ ...botaoPrimario, opacity: !valor ? 0.6 : 1 }}>
            {enviando ? 'Adicionando…' : 'Adicionar aporte'}
          </button>
        </div>
      </form>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <p style={subtituloModal}>Aportes registrados ({aportes.length})</p>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#F59E0B' }}>
            Total {formatBRL(total)}
          </p>
        </div>
        {aportes.length === 0 ? (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-faint)', textAlign: 'center', padding: 16 }}>
            Sem aportes ainda.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
            {aportes.map((a) => (
              <div
                key={a.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 110px 1fr 32px',
                  gap: 8,
                  padding: '8px 10px',
                  fontSize: 12,
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  alignItems: 'center',
                }}
              >
                <span style={{ color: 'var(--text-muted)' }}>{fmtData(a.dia)}</span>
                <span style={{ color: 'var(--text)', fontWeight: 600 }}>{formatBRL(a.valor)}</span>
                <span style={{ color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {a.descricao || '—'}
                </span>
                <button
                  onClick={() => onRemover(a.id)}
                  title="Remover aporte"
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border-strong)',
                    color: '#EF4444',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: 14,
                    fontWeight: 600,
                    padding: '2px 6px',
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// Helpers visuais
// ============================================================
function CardVazio({ titulo, mensagem }: { titulo: string; mensagem: string }) {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px dashed var(--border-strong)',
        borderRadius: 12,
        padding: '2.5rem 1.5rem',
        textAlign: 'center',
      }}
    >
      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>{titulo}</p>
      <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--text-faint)' }}>{mensagem}</p>
    </div>
  )
}

function Aviso({ texto }: { texto: string }) {
  return (
    <div
      style={{
        background: '#EF444411',
        border: '1px solid #EF444444',
        borderRadius: 8,
        padding: '10px 14px',
        color: 'var(--text-error)',
        fontSize: 13,
      }}
    >
      {texto}
    </div>
  )
}

function Campo({
  label,
  tipo,
  valor,
  onChange,
  placeholder,
  required,
}: {
  label: string
  tipo: string
  valor: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
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
        style={inputBase}
      />
    </div>
  )
}

function fmtData(iso: string) {
  if (!iso) return '—'
  return iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4)
}

// ============================================================
// Estilos
// ============================================================
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

const botaoPrimario: React.CSSProperties = {
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
}

const botaoSecundario: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border-strong)',
  color: 'var(--text-muted)',
  padding: '8px 14px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}

const botaoSecundarioModal: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-strong)',
  color: 'var(--text-muted)',
  padding: '9px 16px',
  borderRadius: 8,
  fontSize: 13,
  cursor: 'pointer',
}

const botaoVoltar: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#7C6AF7',
  fontSize: 13,
  cursor: 'pointer',
  padding: 0,
  marginBottom: 14,
}

const botaoIconeRemover: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-strong)',
  color: '#EF4444',
  borderRadius: 6,
  width: 28,
  height: 28,
  fontSize: 16,
  fontWeight: 600,
  cursor: 'pointer',
  lineHeight: 1,
}

const cardClicavel: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '1rem 1.25rem',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  textAlign: 'left',
  transition: 'border-color 0.15s',
}

const tituloSecao: React.CSSProperties = {
  margin: '0 0 12px',
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text-strong)',
}

const subtituloModal: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: 'var(--text-faint)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const textoMudo: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--text-faint)',
}
