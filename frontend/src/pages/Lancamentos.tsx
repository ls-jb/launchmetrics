import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { BadgeStatus } from '@/components/shared/BadgeStatus'
import { EtiquetaTipo, IconePasta, rotaDoLancamento } from '@/components/shared/EtiquetaTipo'
import { Modal } from '@/components/shared/Modal'
import {
  escolhaPastaValida,
  resolverPasta,
  SeletorPasta,
  type EscolhaPasta,
} from '@/components/shared/SeletorPasta'
import { extrairErro } from '@/lib/erro'
import { formatBRL, formatNum, formatPct } from '@/lib/tokens'
import {
  lancamentosService,
  pastasService,
  type LancamentoCreatePayload,
} from '@/services/lancamentosService'
import type { Lancamento, Pasta, TipoLancamento } from '@/types'

/** O que dá pra criar pelo "+ Novo lançamento". */
type EscolhaNovo = TipoLancamento | 'pasta'

/** Estado do modal de criação. `escolha` null = ainda escolhendo o tipo.
 * `pastaId` vem preenchido quando o modal foi aberto de dentro de uma pasta. */
interface NovoEstado {
  escolha: EscolhaNovo | null
  pastaId: string | null
}

const TITULOS_NOVO: Record<EscolhaNovo, string> = {
  leads: 'Novo dashboard de leads',
  vendas: 'Novo dashboard de vendas',
  pasta: 'Nova pasta',
}

/** Separa os dashboards por pasta. Quem não tem pasta (ou aponta pra uma
 * que não existe mais) fica em `soltos`. */
function agruparPorPasta(lancamentos: Lancamento[], pastas: Pasta[]) {
  const porPasta = new Map<string, Lancamento[]>(pastas.map((p) => [p.id, []]))
  const soltos: Lancamento[] = []
  for (const l of lancamentos) {
    const grupo = l.pasta_id ? porPasta.get(l.pasta_id) : undefined
    if (grupo) grupo.push(l)
    else soltos.push(l)
  }
  return { porPasta, soltos }
}

export function Lancamentos() {
  const navigate = useNavigate()
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [pastas, setPastas] = useState<Pasta[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [novo, setNovo] = useState<NovoEstado | null>(null)
  const [movendo, setMovendo] = useState<Lancamento | null>(null)

  const recarregar = () => {
    setCarregando(true)
    setErro('')
    Promise.all([lancamentosService.listar(), pastasService.listar()])
      .then(([ls, ps]) => {
        setLancamentos(ls)
        setPastas(ps)
      })
      .catch((e) => setErro(extrairErro(e)))
      .finally(() => setCarregando(false))
  }

  useEffect(() => {
    recarregar()
  }, [])

  const { porPasta, soltos } = useMemo(
    () => agruparPorPasta(lancamentos, pastas),
    [lancamentos, pastas],
  )
  const vazio = lancamentos.length === 0 && pastas.length === 0
  const pastaDoNovo = pastas.find((p) => p.id === novo?.pastaId) ?? null

  const fecharNovo = () => setNovo(null)

  const aposCriar = (criado: Lancamento) => {
    fecharNovo()
    // No dash de vendas o próximo passo é escolher as ofertas — já leva pra lá.
    if (criado.tipo === 'vendas') navigate(rotaDoLancamento(criado))
    else recarregar()
  }

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
            Dashboards de leads e de vendas de cada lançamento, organizados em pastas
          </p>
        </div>
        <button
          onClick={() => setNovo({ escolha: null, pastaId: null })}
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
      {!carregando && !erro && vazio && (
        <EstadoVazio texto="Nenhum lançamento ainda. Crie o primeiro." />
      )}

      {!carregando && !erro && !vazio && (
        <div style={{ display: 'grid', gap: 18 }}>
          {pastas.map((p) => (
            <BlocoPasta
              key={p.id}
              pasta={p}
              lancamentos={porPasta.get(p.id) ?? []}
              onAdicionar={() => setNovo({ escolha: null, pastaId: p.id })}
              onMover={setMovendo}
              onMudou={recarregar}
            />
          ))}
          {soltos.length > 0 && (
            <section>
              {pastas.length > 0 && <h2 style={tituloSecao}>Sem pasta</h2>}
              <GradeCards lancamentos={soltos} onMover={setMovendo} />
            </section>
          )}
        </div>
      )}

      <Modal
        aberto={novo !== null}
        titulo={novo?.escolha ? TITULOS_NOVO[novo.escolha] : 'O que você quer criar?'}
        onFechar={fecharNovo}
      >
        {novo && novo.escolha === null && (
          <EscolhaTipo
            pasta={pastaDoNovo}
            onEscolher={(escolha) => setNovo({ ...novo, escolha })}
          />
        )}
        {novo && novo.escolha === 'pasta' && (
          <FormNovaPasta
            onVoltar={() => setNovo({ ...novo, escolha: null })}
            onCriada={() => {
              fecharNovo()
              recarregar()
            }}
          />
        )}
        {novo && (novo.escolha === 'leads' || novo.escolha === 'vendas') && (
          <FormNovoLancamento
            key={novo.escolha}
            tipo={novo.escolha}
            pastas={pastas}
            pastaInicial={novo.pastaId}
            onVoltar={() => setNovo({ ...novo, escolha: null })}
            onCriado={aposCriar}
          />
        )}
      </Modal>

      <Modal
        aberto={movendo !== null}
        titulo="Mover para pasta"
        onFechar={() => setMovendo(null)}
        largura={440}
      >
        {movendo && (
          <FormMoverPasta
            lancamento={movendo}
            pastas={pastas}
            onCancelar={() => setMovendo(null)}
            onMovido={() => {
              setMovendo(null)
              recarregar()
            }}
          />
        )}
      </Modal>
    </div>
  )
}

const tituloSecao: React.CSSProperties = {
  margin: '0 0 10px',
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--text-faint)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}

function GradeCards({
  lancamentos,
  onMover,
}: {
  lancamentos: Lancamento[]
  onMover: (l: Lancamento) => void
}) {
  return (
    <div
      style={{
        display: 'grid',
        gap: 14,
        gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
      }}
    >
      {lancamentos.map((l) => (
        <CardLancamento key={l.id} lancamento={l} onMover={onMover} />
      ))}
    </div>
  )
}

/** Bloco de uma pasta: o nome dela e, dentro, os dashboards do mesmo
 * lançamento lado a lado — é o que mostra que eles andam juntos. */
function BlocoPasta({
  pasta,
  lancamentos,
  onAdicionar,
  onMover,
  onMudou,
}: {
  pasta: Pasta
  lancamentos: Lancamento[]
  onAdicionar: () => void
  onMover: (l: Lancamento) => void
  onMudou: () => void
}) {
  const renomear = async () => {
    const nome = prompt('Novo nome da pasta', pasta.nome)?.trim()
    if (!nome || nome === pasta.nome) return
    try {
      await pastasService.renomear(pasta.id, nome)
      onMudou()
    } catch (e) {
      alert(`Erro ao renomear: ${extrairErro(e)}`)
    }
  }

  const excluir = async () => {
    const ok = confirm(
      `Excluir a pasta "${pasta.nome}"?\n\n` +
        'Só a pasta é apagada. Os dashboards de dentro continuam existindo, fora de pasta.',
    )
    if (!ok) return
    try {
      await pastasService.remover(pasta.id)
      onMudou()
    } catch (e) {
      alert(`Erro ao excluir: ${extrairErro(e)}`)
    }
  }

  return (
    <section
      style={{
        background: '#7C6AF70D',
        border: '1px solid #7C6AF733',
        borderRadius: 14,
        padding: '14px 16px 16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 12,
        }}
      >
        <IconePasta tamanho={18} />
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
          {pasta.nome}
        </h2>
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
          {lancamentos.length === 1 ? '1 dashboard' : `${lancamentos.length} dashboards`}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button onClick={onAdicionar} style={{ ...botaoPasta, color: '#7C6AF7' }}>
            + Adicionar dashboard
          </button>
          <button onClick={renomear} style={botaoPasta}>
            Renomear
          </button>
          <button onClick={excluir} style={{ ...botaoPasta, color: '#EF4444' }}>
            Excluir pasta
          </button>
        </div>
      </div>
      {lancamentos.length > 0 ? (
        <GradeCards lancamentos={lancamentos} onMover={onMover} />
      ) : (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>
          Pasta vazia. Adicione aqui o dash de leads e o de vendas deste lançamento — ou mova
          um dashboard que já existe pelo ícone de pasta no card dele.
        </p>
      )}
    </section>
  )
}

const botaoPasta: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-strong)',
  color: 'var(--text-muted)',
  padding: '5px 10px',
  borderRadius: 7,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}

function CardLancamento({
  lancamento: l,
  onMover,
}: {
  lancamento: Lancamento
  onMover: (l: Lancamento) => void
}) {
  return (
    <div style={{ position: 'relative' }}>
      <Link
        to={rotaDoLancamento(l)}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: '1.25rem',
          textDecoration: 'none',
          color: 'inherit',
          display: 'block',
          height: '100%',
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
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            marginBottom: 10,
            paddingRight: 36,
          }}
        >
          <EtiquetaTipo tipo={l.tipo} />
          {l.tipo === 'leads' && <BadgeStatus status={l.status} />}
        </div>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
          {l.nome}
        </h3>
        {l.tipo === 'vendas' ? <ResumoVendas lancamento={l} /> : <ResumoLeads lancamento={l} />}
      </Link>
      <button
        onClick={() => onMover(l)}
        title="Mover para pasta"
        aria-label={`Mover ${l.nome} para uma pasta`}
        style={{
          position: 'absolute',
          top: 14,
          right: 14,
          background: 'var(--surface-2)',
          border: '1px solid var(--border-strong)',
          borderRadius: 7,
          padding: 5,
          cursor: 'pointer',
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <IconePasta tamanho={15} cor="var(--text-muted)" />
      </button>
    </div>
  )
}

/** Miolo do card do dashboard de vendas: receita, vendas, investimento e ROAS. */
function ResumoVendas({ lancamento: l }: { lancamento: Lancamento }) {
  const temInvestimento = l.investimento_total > 0
  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <span
          style={{
            display: 'block',
            fontSize: 11,
            color: 'var(--text-faint)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: 5,
          }}
        >
          Receita
        </span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
            {formatBRL(l.receita_total)}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
            {l.total_vendas === 1 ? '1 venda' : `${formatNum(l.total_vendas)} vendas`}
          </span>
        </div>
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 10,
          paddingTop: 12,
          borderTop: '1px solid var(--border)',
        }}
      >
        <MetricaInline
          label="Investimento"
          valor={temInvestimento ? formatBRL(l.investimento_total) : 'A definir'}
        />
        <MetricaInline
          label="ROAS"
          valor={temInvestimento ? formatRoas(l.roas) : '—'}
          destaque={temInvestimento}
        />
      </div>
    </>
  )
}

const formatRoas = (roas: number) =>
  `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(roas)}x`

/** Miolo do card do dashboard de leads: leads captados x meta, investimento e CPL. */
function ResumoLeads({ lancamento: l }: { lancamento: Lancamento }) {
  const pctLeads = formatPct(l.total_leads, l.meta_leads ?? 0)
  return (
    <>
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
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 10,
          paddingTop: 12,
          borderTop: '1px solid var(--border)',
        }}
      >
        <MetricaInline label="Investimento" valor={formatBRL(l.investimento_total)} />
        <MetricaInline label="CPL" valor={`R$ ${l.cpl.toFixed(2)}`} />
      </div>
    </>
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

// ============================================================
// Modal "+ Novo lançamento": 1º escolhe o tipo, depois preenche
// ============================================================
const OPCOES_NOVO: { escolha: EscolhaNovo; titulo: string; descricao: string }[] = [
  {
    escolha: 'leads',
    titulo: 'Dashboard de Leads',
    descricao:
      'Captação: leads por canal, investimento e CPL. Recebe os leads pelo webhook do Go High Level.',
  },
  {
    escolha: 'vendas',
    titulo: 'Dashboard de Vendas',
    descricao:
      'Resultado do lançamento: você informa o investimento e escolhe as ofertas e produtos vendidos. Mostra receita, ROAS e ticket médio.',
  },
  {
    escolha: 'pasta',
    titulo: 'Pasta',
    descricao:
      'Junta o dash de leads e o de vendas do mesmo lançamento (ex: Black), pra ficar fácil ver que são do mesmo.',
  },
]

function EscolhaTipo({
  pasta,
  onEscolher,
}: {
  /** Pasta de onde o modal foi aberto (se foi). */
  pasta: Pasta | null
  onEscolher: (escolha: EscolhaNovo) => void
}) {
  // Dentro de uma pasta só faz sentido criar dashboard.
  const opcoes = pasta ? OPCOES_NOVO.filter((o) => o.escolha !== 'pasta') : OPCOES_NOVO
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {pasta && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-faint)' }}>
          Vai ser criado dentro da pasta <strong style={{ color: 'var(--text)' }}>{pasta.nome}</strong>.
        </p>
      )}
      {opcoes.map((o) => (
        <button
          key={o.escolha}
          type="button"
          onClick={() => onEscolher(o.escolha)}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12,
            textAlign: 'left',
            background: 'var(--surface-2)',
            border: '1px solid var(--border-strong)',
            borderRadius: 10,
            padding: '14px 16px',
            cursor: 'pointer',
            color: 'inherit',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#7C6AF7')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border-strong)')}
        >
          <span style={{ paddingTop: 1 }}>
            {o.escolha === 'pasta' ? <IconePasta tamanho={20} /> : <EtiquetaTipo tipo={o.escolha} />}
          </span>
          <span>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
              {o.titulo}
            </span>
            <span
              style={{
                display: 'block',
                fontSize: 12,
                color: 'var(--text-faint)',
                marginTop: 3,
                lineHeight: 1.45,
              }}
            >
              {o.descricao}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}

function BotaoVoltar({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        color: '#7C6AF7',
        fontSize: 12,
        padding: 0,
        cursor: 'pointer',
        justifySelf: 'start',
      }}
    >
      ← Escolher outro tipo
    </button>
  )
}

function AvisoErro({ texto }: { texto: string }) {
  return (
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
      {texto}
    </div>
  )
}

function BotaoEnviar({
  enviando,
  desabilitado,
  texto,
  textoEnviando,
}: {
  enviando: boolean
  desabilitado: boolean
  texto: string
  textoEnviando: string
}) {
  return (
    <button
      type="submit"
      disabled={enviando || desabilitado}
      style={{
        background: enviando ? 'var(--text-dim)' : '#7C6AF7',
        border: 'none',
        color: '#fff',
        padding: '9px 18px',
        borderRadius: 8,
        fontSize: 13,
        fontWeight: 600,
        cursor: enviando || desabilitado ? 'not-allowed' : 'pointer',
        opacity: desabilitado ? 0.6 : 1,
      }}
    >
      {enviando ? textoEnviando : texto}
    </button>
  )
}

function FormNovaPasta({
  onVoltar,
  onCriada,
}: {
  onVoltar: () => void
  onCriada: () => void
}) {
  const [nome, setNome] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      await pastasService.criar(nome.trim())
      onCriada()
    } catch (err) {
      setErro(extrairErro(err))
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
      <BotaoVoltar onClick={onVoltar} />
      <Campo
        label="Nome da pasta"
        tipo="text"
        valor={nome}
        onChange={setNome}
        placeholder="Ex: Black Friday 2026"
        required
      />
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-faint)' }}>
        Depois de criar, use "+ Adicionar dashboard" na pasta — ou mova um dashboard que já
        existe pelo ícone de pasta no card dele.
      </p>
      {erro && <AvisoErro texto={erro} />}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <BotaoEnviar
          enviando={enviando}
          desabilitado={!nome.trim()}
          texto="Criar pasta"
          textoEnviando="Criando…"
        />
      </div>
    </form>
  )
}

function FormMoverPasta({
  lancamento,
  pastas,
  onCancelar,
  onMovido,
}: {
  lancamento: Lancamento
  pastas: Pasta[]
  onCancelar: () => void
  onMovido: () => void
}) {
  const [escolha, setEscolha] = useState<EscolhaPasta>({
    valor: lancamento.pasta_id ?? '',
    nomeNova: '',
  })
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      const pastaId = await resolverPasta(escolha)
      await lancamentosService.atualizar(lancamento.id, { pasta_id: pastaId })
      onMovido()
    } catch (err) {
      setErro(extrairErro(err))
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <EtiquetaTipo tipo={lancamento.tipo} />
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{lancamento.nome}</span>
      </div>
      <SeletorPasta pastas={pastas} escolha={escolha} onChange={setEscolha} />
      {erro && <AvisoErro texto={erro} />}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        <button type="button" onClick={onCancelar} disabled={enviando} style={botaoCancelar}>
          Cancelar
        </button>
        <BotaoEnviar
          enviando={enviando}
          desabilitado={!escolhaPastaValida(escolha)}
          texto="Salvar"
          textoEnviando="Salvando…"
        />
      </div>
    </form>
  )
}

const botaoCancelar: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-strong)',
  color: 'var(--text-muted)',
  padding: '9px 16px',
  borderRadius: 8,
  fontSize: 13,
  cursor: 'pointer',
}

function FormNovoLancamento({
  tipo,
  pastas,
  pastaInicial,
  onVoltar,
  onCriado,
}: {
  tipo: TipoLancamento
  pastas: Pasta[]
  pastaInicial: string | null
  onVoltar: () => void
  onCriado: (criado: Lancamento) => void
}) {
  const [nome, setNome] = useState('')
  const [dataInicio, setDataInicio] = useState('')
  const [dataFim, setDataFim] = useState('')
  const [metaLeads, setMetaLeads] = useState('')
  const [tetoInvestimento, setTetoInvestimento] = useState('')
  const [investimento, setInvestimento] = useState('')
  const [pasta, setPasta] = useState<EscolhaPasta>({ valor: pastaInicial ?? '', nomeNova: '' })
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const ehVendas = tipo === 'vendas'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro('')
    setEnviando(true)
    try {
      const payload: LancamentoCreatePayload = {
        nome,
        tipo,
        pasta_id: await resolverPasta(pasta),
        data_inicio: dataInicio || null,
        data_fim: dataFim || null,
        meta_leads: !ehVendas && metaLeads ? Number(metaLeads) : null,
        teto_investimento: !ehVendas && tetoInvestimento ? Number(tetoInvestimento) : null,
        investimento_manual: ehVendas && investimento ? Number(investimento) : null,
      }
      onCriado(await lancamentosService.criar(payload))
    } catch (err) {
      setErro(extrairErro(err))
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
      <BotaoVoltar onClick={onVoltar} />
      <Campo
        label="Nome do lançamento"
        tipo="text"
        valor={nome}
        onChange={setNome}
        placeholder={ehVendas ? 'Ex: Black Friday 2026 — Vendas' : 'Ex: Método Acelerado — Edição Junho'}
        required
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Campo label="Data de início" tipo="date" valor={dataInicio} onChange={setDataInicio} />
        <Campo label="Data de fim" tipo="date" valor={dataFim} onChange={setDataFim} />
      </div>
      {ehVendas ? (
        <>
          <Campo
            label="Investimento (R$) — opcional"
            tipo="number"
            valor={investimento}
            onChange={setInvestimento}
            placeholder="Pode preencher depois"
            step="0.01"
          />
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.5 }}>
            Só contam as vendas feitas entre a data de início e a de fim (sem datas, contam
            todas). As ofertas e produtos você escolhe na próxima tela.
          </p>
        </>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Campo label="Meta de leads" tipo="number" valor={metaLeads} onChange={setMetaLeads} placeholder="5000" />
          <Campo
            label="Teto de investimento (R$)"
            tipo="number"
            valor={tetoInvestimento}
            onChange={setTetoInvestimento}
            placeholder="50000"
            step="0.01"
          />
        </div>
      )}
      <SeletorPasta pastas={pastas} escolha={pasta} onChange={setPasta} />

      {erro && <AvisoErro texto={erro} />}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
        <BotaoEnviar
          enviando={enviando}
          desabilitado={!nome || !escolhaPastaValida(pasta)}
          texto={ehVendas ? 'Criar e escolher ofertas' : 'Criar lançamento'}
          textoEnviando="Criando…"
        />
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

