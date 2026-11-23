import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'

import { BotaoAtualizar } from '@/components/shared/BotaoAtualizar'
import { DashboardsRelacionados } from '@/components/shared/DashboardsRelacionados'
import { EditavelInline } from '@/components/shared/EditavelInline'
import { EtiquetaTipo } from '@/components/shared/EtiquetaTipo'
import { GraficoReceitaDia } from '@/components/shared/GraficoReceitaDia'
import { KPICard } from '@/components/shared/KPICard'
import { Modal } from '@/components/shared/Modal'
import { SeletorOfertasLancamento } from '@/components/shared/SeletorOfertasLancamento'
import { extrairErro } from '@/lib/erro'
import { formatBRL, formatBRLPreciso, formatNum } from '@/lib/tokens'
import { EditorDatas } from '@/pages/LancamentoDetalhe'
import { lancamentosService } from '@/services/lancamentosService'
import type {
  Lancamento,
  LancamentoVendasPainel,
  ProdutoVendido,
  VinculoOferta,
} from '@/types'

const formatRoas = (roas: number) =>
  `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roas)}x`

const formatarData = (data: string) =>
  data.slice(8, 10) + '/' + data.slice(5, 7) + '/' + data.slice(0, 4)

/** Frase que explica quais vendas estão entrando na conta. */
function descreverPeriodo(l: Lancamento): string {
  if (l.data_inicio && l.data_fim) {
    return `Contando as vendas de ${formatarData(l.data_inicio)} a ${formatarData(l.data_fim)}.`
  }
  if (l.data_inicio) return `Contando as vendas a partir de ${formatarData(l.data_inicio)}.`
  if (l.data_fim) return `Contando as vendas até ${formatarData(l.data_fim)}.`
  return 'Sem período definido: contando todas as vendas das ofertas selecionadas.'
}

export function LancamentoVendasDetalhe() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [painel, setPainel] = useState<LancamentoVendasPainel | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [atualizando, setAtualizando] = useState(false)
  const [erro, setErro] = useState('')
  const [modalOfertas, setModalOfertas] = useState(false)

  const carregar = useCallback(
    async (silencioso = false) => {
      if (!id) return
      if (!silencioso) setCarregando(true)
      else setAtualizando(true)
      setErro('')
      try {
        setPainel(await lancamentosService.painelVendas(id))
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

  const porDia = useMemo(
    () =>
      (painel?.por_dia ?? []).map((p) => ({
        data: p.dia.slice(8, 10) + '/' + p.dia.slice(5, 7),
        receita: Number(p.receita) || 0,
        quantidade: Number(p.quantidade) || 0,
      })),
    [painel],
  )

  if (carregando) return <Mensagem texto="Carregando dashboard de vendas…" />
  if (erro) return <Mensagem texto={`Erro ao carregar: ${erro}`} tipo="erro" />
  if (!painel || !id) return <Mensagem texto="Lançamento não encontrado." />

  const l = painel.lancamento
  // Abriram um dash de leads por este endereço — manda pra tela certa.
  if (l.tipo !== 'vendas') return <Navigate to={`/lancamentos/${id}`} replace />

  const temSelecao = painel.vinculos.length > 0
  const temInvestimento = l.investimento_total > 0

  const salvarInvestimento = async (valor: number | null) => {
    await lancamentosService.atualizar(id, { investimento_manual: valor ?? 0 })
    await carregar(true)
  }

  const salvarDatas = async (inicio: string | null, fim: string | null) => {
    await lancamentosService.atualizar(id, { data_inicio: inicio, data_fim: fim })
    await carregar(true)
  }

  const salvarOfertas = async (itens: VinculoOferta[]) => {
    setPainel(await lancamentosService.definirOfertas(id, itens))
    setModalOfertas(false)
  }

  const excluir = async () => {
    const ok = confirm(
      `Excluir o dashboard de vendas "${l.nome}"?\n\n` +
        'Isso apaga o investimento e a seleção de ofertas deste lançamento. ' +
        'As vendas em si NÃO são apagadas. Não dá pra desfazer.',
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
      <Link to="/lancamentos" style={linkVoltar}>
        ← Voltar para lançamentos
      </Link>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: '1rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{l.nome}</h1>
            <EtiquetaTipo tipo="vendas" />
          </div>
          <EditorDatas inicio={l.data_inicio} fim={l.data_fim} onSalvar={salvarDatas} />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <BotaoAtualizar onClick={() => carregar(true)} atualizando={atualizando} />
          <button onClick={() => setModalOfertas(true)} style={botaoPrimario}>
            Selecionar ofertas e produtos
          </button>
          <button onClick={excluir} title="Excluir este dashboard" style={botaoExcluir}>
            Excluir
          </button>
        </div>
      </div>

      <DashboardsRelacionados lancamento={l} />

      <p style={{ margin: '0 0 1rem', fontSize: 12, color: 'var(--text-faint)' }}>
        {descreverPeriodo(l)}
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
          marginBottom: '1.5rem',
        }}
      >
        <div style={cardKpi}>
          <p style={rotuloKpi}>Investimento</p>
          <EditavelInline
            label="Investimento"
            valor={temInvestimento ? l.investimento_manual : null}
            formatar={formatBRL}
            aoSalvar={salvarInvestimento}
            destaque
          />
          <p style={{ fontSize: 12, color: 'var(--text-faint)', margin: '4px 0 0' }}>
            Digitado à mão — clique pra editar
          </p>
        </div>
        <KPICard
          label="Receita"
          valor={formatBRL(l.receita_total)}
          sub={l.total_vendas === 1 ? '1 venda' : `${formatNum(l.total_vendas)} vendas`}
        />
        <KPICard
          label="ROAS"
          valor={temInvestimento ? formatRoas(l.roas) : '—'}
          sub={temInvestimento ? 'Receita ÷ investimento' : 'Informe o investimento'}
        />
        <KPICard
          label="Ticket médio"
          valor={l.total_vendas > 0 ? formatBRLPreciso(l.ticket_medio) : '—'}
          sub="Receita ÷ vendas"
        />
      </div>

      {!temSelecao ? (
        <div style={{ ...cartao, textAlign: 'center', padding: '2.5rem 2rem' }}>
          <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
            Nenhuma oferta selecionada ainda
          </p>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--text-faint)' }}>
            Escolha as ofertas e produtos que venderam por este lançamento pra ver receita e ROAS.
          </p>
          <button onClick={() => setModalOfertas(true)} style={botaoPrimario}>
            Selecionar ofertas e produtos
          </button>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '1.5rem' }}>
            {porDia.length > 0 ? (
              <GraficoReceitaDia dados={porDia} />
            ) : (
              <div style={{ ...cartao, color: 'var(--text-faint)', fontSize: 13 }}>
                Nenhuma venda das ofertas selecionadas neste período.
              </div>
            )}
          </div>
          <TabelaOfertas grupos={painel.produtos} />
        </>
      )}

      <Modal
        aberto={modalOfertas}
        titulo="Ofertas e produtos do lançamento"
        onFechar={() => setModalOfertas(false)}
        largura={640}
      >
        <SeletorOfertasLancamento
          selecionados={painel.vinculos}
          onCancelar={() => setModalOfertas(false)}
          onSalvar={salvarOfertas}
        />
      </Modal>
    </div>
  )
}

function TabelaOfertas({ grupos }: { grupos: ProdutoVendido[] }) {
  return (
    <div style={cartao}>
      <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
        Vendas por produto e oferta
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ ...celulaTitulo, textAlign: 'left' }}>Produto / oferta</th>
              <th style={celulaTitulo}>Vendas</th>
              <th style={celulaTitulo}>Receita</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <LinhasDoProduto key={g.produto} grupo={g} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function LinhasDoProduto({ grupo: g }: { grupo: ProdutoVendido }) {
  return (
    <>
      <tr style={{ background: 'var(--surface-2)' }}>
        <td style={{ ...celula, textAlign: 'left', fontWeight: 600, color: 'var(--text)' }}>
          {g.produto}
          {g.inteiro && <span style={seloInteiro}>Produto inteiro</span>}
        </td>
        <td style={{ ...celula, fontWeight: 600, color: 'var(--text)' }}>{formatNum(g.quantidade)}</td>
        <td style={{ ...celula, fontWeight: 600, color: 'var(--text)' }}>{formatBRL(g.receita)}</td>
      </tr>
      {g.ofertas.map((o) => (
        <tr key={o.oferta_codigo ?? 'sem-codigo'}>
          <td style={{ ...celula, textAlign: 'left', paddingLeft: 24 }}>
            {o.oferta_nome || (o.oferta_codigo ? '(oferta sem nome)' : 'Vendas sem código de oferta')}
            {o.oferta_codigo && (
              <span style={{ color: 'var(--text-faint)', fontSize: 11 }}> · cód {o.oferta_codigo}</span>
            )}
          </td>
          <td style={celula}>{formatNum(o.quantidade)}</td>
          <td style={celula}>{formatBRL(o.receita)}</td>
        </tr>
      ))}
    </>
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

const linkVoltar: React.CSSProperties = {
  color: '#7C6AF7',
  fontSize: 13,
  textDecoration: 'none',
  display: 'inline-block',
  marginBottom: 14,
}

const cartao: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '1.25rem',
}

const cardKpi: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '1rem 1.25rem',
}

const rotuloKpi: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--text-faint)',
  margin: '0 0 6px',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}

const botaoPrimario: React.CSSProperties = {
  background: '#7C6AF7',
  border: 'none',
  color: '#fff',
  padding: '8px 14px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}

const botaoExcluir: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border-strong)',
  color: '#EF4444',
  padding: '8px 14px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}

const celulaTitulo: React.CSSProperties = {
  textAlign: 'right',
  padding: '8px 10px',
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-faint)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  borderBottom: '1px solid var(--border)',
}

const celula: React.CSSProperties = {
  textAlign: 'right',
  padding: '8px 10px',
  color: 'var(--text-muted)',
  borderBottom: '1px solid var(--border)',
  fontVariantNumeric: 'tabular-nums',
}

const seloInteiro: React.CSSProperties = {
  marginLeft: 8,
  fontSize: 10,
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 99,
  background: '#7C6AF722',
  color: '#7C6AF7',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}
