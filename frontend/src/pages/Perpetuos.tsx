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
  CategoriaPerpetuo,
  OfertaDisponivel,
  OfertaDoDiaPerp,
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
  const [diaDetalhe, setDiaDetalhe] = useState<string | null>(null)
  const [ofertasDoDia, setOfertasDoDia] = useState<OfertaDoDiaPerp[] | null>(null)
  const [erroDia, setErroDia] = useState('')
  const [modalAportes, setModalAportes] = useState(false)
  const [modalMeta, setModalMeta] = useState(false)

  // Filtro de categoria pros KPIs. null = ainda não inicializado (a 1ª
  // carga popula com todas as categorias existentes). Investimento fica
  // sempre o total — só receita/qtd/ROAS refletem as marcadas.
  const [categoriasKPI, setCategoriasKPI] = useState<Set<CategoriaPerpetuo> | null>(null)

  // Impostos aplicados no investimento (só afeta a visualização — não
  // altera aportes gravados). Persistido por perpétuo no localStorage
  // do navegador; cada usuário decide se quer ver com ou sem imposto.
  const [modalImpostos, setModalImpostos] = useState(false)
  const [impostos, setImpostos] = useState<ImpostosConfig>(() =>
    carregarImpostos(perpetuoId),
  )
  const atualizarImpostos = (novo: ImpostosConfig) => {
    setImpostos(novo)
    salvarImpostos(perpetuoId, novo)
  }

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

  const alterarCategoriaOferta = async (
    id: string,
    categoria: CategoriaPerpetuo,
  ) => {
    await perpetuosService.atualizarOferta(id, { categoria })
    await carregar(false)
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

  // Categorias que existem nas ofertas cadastradas — só essas viram
  // opção do filtro (não polui a UI com opções sem venda).
  const categoriasDisponiveis: CategoriaPerpetuo[] = (() => {
    const ordem: CategoriaPerpetuo[] = [
      'Principal',
      'Order Bump',
      'Upsell',
      'UpUpsell',
      'Downsell',
      'Outros',
    ]
    const set = new Set(completo.ofertas.map((o) => o.categoria))
    return ordem.filter((c) => set.has(c))
  })()

  // Inicializa "todas marcadas" na 1ª renderização e mantém sincronizado
  // caso apareça uma categoria nova (nova oferta cadastrada).
  const catsAtivas = categoriasKPI ?? new Set(categoriasDisponiveis)

  const investBruto = Number(completo.investimento_total)
  // Investimento com impostos aplicados. Só afeta os KPIs — os aportes
  // gravados no banco continuam com valor original.
  const multiplicadorImposto = impostos.metaAds12_5 ? 1.125 : 1
  const invest = investBruto * multiplicadorImposto
  // Receita/qtd só das categorias marcadas
  const receita = completo.ofertas
    .filter((o) => catsAtivas.has(o.categoria))
    .reduce((s, o) => s + Number(o.receita), 0)
  const qtd = completo.ofertas
    .filter((o) => catsAtivas.has(o.categoria))
    .reduce((s, o) => s + o.quantidade, 0)
  const roas = invest > 0 ? receita / invest : 0
  const algumImpostoAtivo = impostos.metaAds12_5

  const alternarCategoriaKPI = (cat: CategoriaPerpetuo) => {
    const base = categoriasKPI ?? new Set(categoriasDisponiveis)
    const novo = new Set(base)
    if (novo.has(cat)) novo.delete(cat)
    else novo.add(cat)
    setCategoriasKPI(novo)
  }

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
          <button
            onClick={() => setModalImpostos(true)}
            style={{
              ...botaoSecundario,
              ...(algumImpostoAtivo
                ? { borderColor: '#F59E0B', color: '#F59E0B' }
                : {}),
            }}
            title="Aplicar impostos no cálculo do investimento (só afeta a visualização — não altera aportes)"
          >
            {algumImpostoAtivo ? '💰 Impostos ativos' : 'Impostos'}
          </button>
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

      {/* Filtro de categoria pros KPIs. Investimento nunca muda — é o
          gasto total de anúncio. Marcando só "Principal" você tem o
          ROAS de front (spend total / receita do principal). */}
      {categoriasDisponiveis.length > 1 && (
        <div
          style={{
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            flexWrap: 'wrap',
            marginBottom: 12,
            padding: '10px 14px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Considerar:
          </span>
          {categoriasDisponiveis.map((cat) => {
            const marcado = catsAtivas.has(cat)
            const cor = CAT_COR_PERP[cat]
            return (
              <label
                key={cat}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  fontSize: 12,
                  color: marcado ? cor : 'var(--text-faint)',
                  opacity: marcado ? 1 : 0.55,
                }}
              >
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => alternarCategoriaKPI(cat)}
                  style={{ accentColor: cor }}
                />
                <span
                  style={{
                    background: marcado ? `${cor}22` : 'transparent',
                    border: `1px solid ${marcado ? cor : 'var(--border-strong)'}`,
                    padding: '2px 8px',
                    borderRadius: 99,
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {cat}
                </span>
              </label>
            )
          })}
        </div>
      )}

      {/* 5 KPIs — Lucro = Faturamento - Investimento, verde se positivo,
          vermelho se negativo (prejuízo) */}
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
        <KPICard
          label="Lucro"
          valor={formatBRL(receita - invest)}
          cor={receita - invest >= 0 ? '#3ECFB2' : '#EF4444'}
        />
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
            <CardOferta
              key={o.id}
              detalhe={o}
              isAdmin={isAdmin}
              onRemover={removerOferta}
              onAlterarCategoria={alterarCategoriaOferta}
            />
          ))}
        </div>
      )}

      {/* Gráfico diário */}
      <h3 style={tituloSecao}>Vendas por dia × categoria</h3>
      <div style={{ marginBottom: '1.5rem' }}>
        <GraficoPerpetuoDia
          vendas={vendasDia}
          investimento={investDia}
          onClickDia={async (dia) => {
            setDiaDetalhe(dia)
            setOfertasDoDia(null)
            setErroDia('')
            try {
              const ofertas = await perpetuosService.vendasDoDia(perpetuoId, dia)
              setOfertasDoDia(ofertas)
            } catch (e) {
              setErroDia(extrairErro(e))
              setOfertasDoDia([])
            }
          }}
        />
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

      <Modal
        aberto={diaDetalhe !== null}
        titulo={diaDetalhe ? `Vendas de ${fmtDiaBR(diaDetalhe)}` : ''}
        onFechar={() => {
          setDiaDetalhe(null)
          setOfertasDoDia(null)
          setErroDia('')
        }}
        largura={640}
      >
        <DetalheDiaPerp ofertas={ofertasDoDia} erro={erroDia} />
      </Modal>

      <Modal
        aberto={modalImpostos}
        titulo="Impostos"
        onFechar={() => setModalImpostos(false)}
        largura={480}
      >
        <FormImpostos
          valor={impostos}
          onChange={atualizarImpostos}
          onFechar={() => setModalImpostos(false)}
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
  onAlterarCategoria,
}: {
  detalhe: PerpetuoOfertaDetalhe
  isAdmin: boolean
  onRemover: (id: string) => void
  onAlterarCategoria: (id: string, cat: CategoriaPerpetuo) => Promise<void>
}) {
  const cpv =
    detalhe.quantidade > 0 ? Number(detalhe.receita) / detalhe.quantidade : 0
  const corCategoria: Record<string, string> = {
    Principal: '#7C6AF7',
    'Order Bump': '#F59E0B',
    Upsell: '#60A5FA',
    UpUpsell: '#06B6D4',
    Downsell: '#EC4899',
    Outros: '#6B7280',
  }
  const [editandoCat, setEditandoCat] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const cor = corCategoria[detalhe.categoria] || '#6B7280'

  const escolher = async (nova: CategoriaPerpetuo) => {
    if (nova === detalhe.categoria) {
      setEditandoCat(false)
      return
    }
    setSalvando(true)
    try {
      await onAlterarCategoria(detalhe.id, nova)
      setEditandoCat(false)
    } catch (e) {
      alert(extrairErro(e))
    } finally {
      setSalvando(false)
    }
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
          {editandoCat && isAdmin ? (
            <select
              autoFocus
              disabled={salvando}
              value={detalhe.categoria}
              onChange={(e) => escolher(e.target.value as CategoriaPerpetuo)}
              onBlur={() => setEditandoCat(false)}
              style={{
                ...selectInline,
                marginBottom: 6,
                borderColor: cor,
                color: cor,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              <option value="Principal">Principal</option>
              <option value="Order Bump">Order Bump</option>
              <option value="Upsell">Upsell</option>
              <option value="UpUpsell">UpUpsell</option>
              <option value="Downsell">Downsell</option>
              <option value="Outros">Outros</option>
            </select>
          ) : (
            <button
              type="button"
              onClick={() => isAdmin && setEditandoCat(true)}
              title={isAdmin ? 'Clique pra alterar' : ''}
              style={{
                display: 'inline-block',
                fontSize: 10,
                fontWeight: 700,
                color: cor,
                background: `${cor}22`,
                padding: '2px 8px',
                borderRadius: 99,
                marginBottom: 6,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                border: 'none',
                cursor: isAdmin ? 'pointer' : 'default',
              }}
            >
              {detalhe.categoria}
            </button>
          )}
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
  // Categoria manual por oferta_codigo. null (chave ausente) = "auto"
  // (heurística no backend); presença = override explícito.
  const [categorias, setCategorias] = useState<
    Record<string, CategoriaPerpetuo>
  >({})
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

  const setCategoria = (codigo: string, cat: CategoriaPerpetuo | '') => {
    setCategorias((prev) => {
      const novo = { ...prev }
      if (cat === '') delete novo[codigo]
      else novo[codigo] = cat
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
          categoria: categorias[cod] ?? null,
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
          filtrados.map((o) => {
            const marcado = selecionados.has(o.oferta_codigo)
            return (
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
                  background: marcado ? 'var(--border)' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => alternar(o.oferta_codigo)}
                  style={{ marginTop: 3 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 500 }}>{o.oferta_nome || '(sem nome)'}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-faint)' }}>
                    {o.produto || '—'} · cód {o.oferta_codigo}
                  </p>
                  {marcado && (
                    <div
                      style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}
                      onClick={(e) => e.preventDefault()}
                    >
                      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>Categoria:</span>
                      <select
                        value={categorias[o.oferta_codigo] ?? ''}
                        onChange={(e) =>
                          setCategoria(
                            o.oferta_codigo,
                            e.target.value as CategoriaPerpetuo | '',
                          )
                        }
                        style={selectInline}
                      >
                        <option value="">Auto (pelo nome)</option>
                        <option value="Principal">Principal</option>
                        <option value="Order Bump">Order Bump</option>
                        <option value="Upsell">Upsell</option>
                        <option value="UpUpsell">UpUpsell</option>
                        <option value="Downsell">Downsell</option>
                        <option value="Outros">Outros</option>
                      </select>
                    </div>
                  )}
                </div>
              </label>
            )
          })
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

const selectInline: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  padding: '3px 6px',
  color: 'var(--text)',
  fontSize: 11,
  colorScheme: 'dark',
  cursor: 'pointer',
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

// ============================================================
// Drill-down: detalhes do dia clicado no gráfico do perpétuo
// ============================================================
const CAT_COR_PERP: Record<CategoriaPerpetuo, string> = {
  Principal: '#7C6AF7',
  'Order Bump': '#F59E0B',
  Upsell: '#60A5FA',
  UpUpsell: '#06B6D4',
  Downsell: '#EC4899',
  Outros: '#6B7280',
}

function fmtDiaBR(dia: string): string {
  return dia.slice(8, 10) + '/' + dia.slice(5, 7) + '/' + dia.slice(0, 4)
}

// ============================================================
// Impostos aplicados sobre o investimento (só visualização — não altera
// aportes do banco). Persistido por perpétuo no localStorage. Adicionar
// novos impostos no futuro = campo novo no type + linha nova no form.
// ============================================================
type ImpostosConfig = {
  metaAds12_5: boolean
}

const IMPOSTOS_DEFAULT: ImpostosConfig = { metaAds12_5: false }

function chaveImpostos(perpetuoId: string): string {
  return `perpetuo:${perpetuoId}:impostos`
}

function carregarImpostos(perpetuoId: string): ImpostosConfig {
  try {
    const raw = localStorage.getItem(chaveImpostos(perpetuoId))
    if (!raw) return IMPOSTOS_DEFAULT
    const parsed = JSON.parse(raw) as Partial<ImpostosConfig>
    // Merge com default pra sobreviver a upgrades futuros (chaves novas)
    return { ...IMPOSTOS_DEFAULT, ...parsed }
  } catch {
    return IMPOSTOS_DEFAULT
  }
}

function salvarImpostos(perpetuoId: string, valor: ImpostosConfig): void {
  try {
    localStorage.setItem(chaveImpostos(perpetuoId), JSON.stringify(valor))
  } catch {
    // storage cheio ou bloqueado — ignora (config é preferência, não crítico)
  }
}

function FormImpostos({
  valor,
  onChange,
  onFechar,
}: {
  valor: ImpostosConfig
  onChange: (v: ImpostosConfig) => void
  onFechar: () => void
}) {
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-faint)' }}>
        Aplica os impostos marcados sobre o <b>investimento</b> exibido no
        dashboard. O ROAS e o Lucro recalculam automaticamente. Isso NÃO
        altera os aportes gravados no banco — é só uma preferência de
        visualização, salva neste navegador.
      </p>

      <label
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: 12,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          cursor: 'pointer',
        }}
      >
        <input
          type="checkbox"
          checked={valor.metaAds12_5}
          onChange={(e) => onChange({ ...valor, metaAds12_5: e.target.checked })}
          style={{ marginTop: 2 }}
        />
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            12,5% de imposto da Meta
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--text-faint)' }}>
            Multiplica o investimento por 1,125 (CIDE/PIS/COFINS de remessa).
          </p>
        </div>
      </label>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onFechar}
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
          Fechar
        </button>
      </div>
    </div>
  )
}

function DetalheDiaPerp({
  ofertas,
  erro,
}: {
  ofertas: OfertaDoDiaPerp[] | null
  erro: string
}) {
  if (erro) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-error)' }}>{erro}</p>
    )
  }
  if (ofertas === null) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>
        Carregando…
      </p>
    )
  }
  if (ofertas.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>
        Sem vendas nesse dia.
      </p>
    )
  }
  const totalQtd = ofertas.reduce((a, o) => a + o.quantidade, 0)
  const totalReceita = ofertas.reduce((a, o) => a + Number(o.receita), 0)
  return (
    <div>
      <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--text-faint)' }}>
        Total: <b style={{ color: 'var(--text)' }}>{formatNum(totalQtd)}</b>{' '}
        {totalQtd === 1 ? 'venda' : 'vendas'} ·{' '}
        <b style={{ color: 'var(--text)' }}>{formatBRL(totalReceita)}</b>
      </p>
      <div style={{ display: 'grid', gap: 8 }}>
        {ofertas.map((o, i) => (
          <div
            key={`${o.produto}-${o.oferta_codigo ?? i}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 12px',
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              minWidth: 0,
            }}
          >
            <span
              style={{
                width: 3,
                alignSelf: 'stretch',
                background: CAT_COR_PERP[o.categoria],
                borderRadius: 2,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={o.produto}
              >
                {o.produto}
              </p>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: 11,
                  color: 'var(--text-faint)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={o.oferta_nome ?? undefined}
              >
                {o.categoria}
                {o.oferta_nome ? ` · ${o.oferta_nome}` : ''}
              </p>
            </div>
            <span
              style={{
                fontSize: 12,
                color: 'var(--text-faint)',
                whiteSpace: 'nowrap',
                width: 80,
                textAlign: 'right',
              }}
            >
              {formatNum(o.quantidade)} {o.quantidade === 1 ? 'venda' : 'vendas'}
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--text)',
                whiteSpace: 'nowrap',
                width: 100,
                textAlign: 'right',
              }}
            >
              {formatBRL(Number(o.receita))}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
