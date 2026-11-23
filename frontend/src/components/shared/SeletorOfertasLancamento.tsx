import { useEffect, useMemo, useState } from 'react'

import { extrairErro } from '@/lib/erro'
import { perpetuosService } from '@/services/perpetuosService'
import { vendasService } from '@/services/vendasService'
import type { OfertaDisponivel, VinculoOferta } from '@/types'

const SEM_PRODUTO = 'Sem produto identificado'

interface GrupoProduto {
  /** Nome do produto — null no grupo das ofertas sem produto. */
  produto: string | null
  ofertas: OfertaDisponivel[]
}

/** Junta as ofertas por produto. Produtos sem nenhuma oferta com código
 * também entram (dá pra marcar o produto inteiro). O que já estava
 * selecionado aparece mesmo que não tenha mais venda aprovada. */
function montarGrupos(
  ofertas: OfertaDisponivel[],
  produtos: string[],
  selecionados: VinculoOferta[],
): GrupoProduto[] {
  const porProduto = new Map<string, OfertaDisponivel[]>()
  const semProduto: OfertaDisponivel[] = []
  const codigos = new Set<string>()
  const incluir = (o: OfertaDisponivel) => {
    if (codigos.has(o.oferta_codigo)) return
    codigos.add(o.oferta_codigo)
    if (!o.produto) semProduto.push(o)
    else porProduto.set(o.produto, [...(porProduto.get(o.produto) ?? []), o])
  }
  ofertas.forEach(incluir)
  for (const s of selecionados) {
    if (s.oferta_codigo) {
      incluir({ oferta_codigo: s.oferta_codigo, oferta_nome: s.oferta_nome, produto: s.produto })
    }
  }
  const nomes = [...produtos, ...selecionados.map((s) => s.produto ?? '')].filter(Boolean)
  for (const nome of nomes) {
    if (!porProduto.has(nome)) porProduto.set(nome, [])
  }
  const grupos: GrupoProduto[] = [...porProduto.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([produto, lista]) => ({ produto, ofertas: lista }))
  if (semProduto.length > 0) grupos.push({ produto: null, ofertas: semProduto })
  return grupos
}

/** Aplica o texto da busca: casa com o nome do produto (mostra o grupo
 * todo) ou com nome/código da oferta (mostra só as que casam). */
function filtrarGrupos(grupos: GrupoProduto[], busca: string): GrupoProduto[] {
  const q = busca.trim().toLowerCase()
  if (!q) return grupos
  return grupos.flatMap((g) => {
    if ((g.produto ?? SEM_PRODUTO).toLowerCase().includes(q)) return [g]
    const ofertas = g.ofertas.filter(
      (o) =>
        o.oferta_codigo.toLowerCase().includes(q) ||
        (o.oferta_nome ?? '').toLowerCase().includes(q),
    )
    return ofertas.length > 0 ? [{ ...g, ofertas }] : []
  })
}

function alternarNoSet<T>(conjunto: Set<T>, item: T): Set<T> {
  const novo = new Set(conjunto)
  if (novo.has(item)) novo.delete(item)
  else novo.add(item)
  return novo
}

/** Escolhe o que conta como venda do lançamento: ofertas soltas e/ou
 * produtos inteiros. `onSalvar` recebe o estado final das caixinhas. */
export function SeletorOfertasLancamento({
  selecionados,
  onCancelar,
  onSalvar,
}: {
  selecionados: VinculoOferta[]
  onCancelar: () => void
  onSalvar: (itens: VinculoOferta[]) => Promise<void>
}) {
  const [ofertas, setOfertas] = useState<OfertaDisponivel[]>([])
  const [produtos, setProdutos] = useState<string[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [codigosMarcados, setCodigosMarcados] = useState<Set<string>>(
    () => new Set(selecionados.flatMap((s) => (s.oferta_codigo ? [s.oferta_codigo] : []))),
  )
  const [produtosInteiros, setProdutosInteiros] = useState<Set<string>>(
    () => new Set(selecionados.flatMap((s) => (!s.oferta_codigo && s.produto ? [s.produto] : []))),
  )
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    Promise.all([perpetuosService.ofertasDisponiveis(), vendasService.produtos()])
      .then(([os, ps]) => {
        setOfertas(os)
        setProdutos(ps)
      })
      .catch((e) => setErro(`Não deu pra carregar as ofertas: ${extrairErro(e)}`))
      .finally(() => setCarregando(false))
  }, [])

  const grupos = useMemo(
    () => montarGrupos(ofertas, produtos, selecionados),
    [ofertas, produtos, selecionados],
  )
  const visiveis = useMemo(() => filtrarGrupos(grupos, busca), [grupos, busca])

  // Oferta de produto marcado por inteiro já está coberta pelo produto.
  const ofertasAvulsas = useMemo(
    () =>
      grupos.flatMap((g) =>
        g.produto && produtosInteiros.has(g.produto)
          ? []
          : g.ofertas.filter((o) => codigosMarcados.has(o.oferta_codigo)),
      ),
    [grupos, codigosMarcados, produtosInteiros],
  )

  const salvar = async () => {
    setErro('')
    setEnviando(true)
    const itens: VinculoOferta[] = [
      ...[...produtosInteiros].map((produto) => ({
        produto,
        oferta_codigo: null,
        oferta_nome: null,
      })),
      ...ofertasAvulsas.map((o) => ({
        produto: o.produto,
        oferta_codigo: o.oferta_codigo,
        oferta_nome: o.oferta_nome,
      })),
    ]
    try {
      await onSalvar(itens)
    } catch (e) {
      setErro(extrairErro(e))
      setEnviando(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.5 }}>
        Marque as ofertas que venderam por este lançamento. Marcando o{' '}
        <strong style={{ color: 'var(--text)' }}>produto inteiro</strong>, todas as ofertas dele
        contam — inclusive as que forem criadas depois.
      </p>
      <input
        type="text"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por produto, oferta ou código…"
        style={campoBusca}
        autoFocus
      />
      <div style={listaRolavel}>
        {carregando && <p style={textoVazio}>Carregando ofertas…</p>}
        {!carregando && visiveis.length === 0 && (
          <p style={textoVazio}>
            {grupos.length === 0 ? 'Ainda não há vendas aprovadas registradas.' : 'Nada encontrado.'}
          </p>
        )}
        {visiveis.map((g) => (
          <GrupoOfertas
            key={g.produto ?? SEM_PRODUTO}
            grupo={g}
            inteiro={g.produto !== null && produtosInteiros.has(g.produto)}
            codigosMarcados={codigosMarcados}
            onAlternarProduto={(p) => setProdutosInteiros((prev) => alternarNoSet(prev, p))}
            onAlternarOferta={(c) => setCodigosMarcados((prev) => alternarNoSet(prev, c))}
          />
        ))}
      </div>

      {erro && <div style={avisoErro}>{erro}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>
          {produtosInteiros.size} produto(s) inteiro(s) · {ofertasAvulsas.length} oferta(s) avulsa(s)
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={onCancelar} disabled={enviando} style={botaoSecundario}>
            Cancelar
          </button>
          <button
            type="button"
            onClick={salvar}
            disabled={enviando || carregando}
            style={{ ...botaoPrimario, opacity: enviando || carregando ? 0.6 : 1 }}
          >
            {enviando ? 'Salvando…' : 'Salvar seleção'}
          </button>
        </div>
      </div>
    </div>
  )
}

function GrupoOfertas({
  grupo,
  inteiro,
  codigosMarcados,
  onAlternarProduto,
  onAlternarOferta,
}: {
  grupo: GrupoProduto
  inteiro: boolean
  codigosMarcados: Set<string>
  onAlternarProduto: (produto: string) => void
  onAlternarOferta: (codigo: string) => void
}) {
  const { produto, ofertas } = grupo
  return (
    <div style={{ marginBottom: 6 }}>
      {produto ? (
        <label style={{ ...linha, background: inteiro ? '#7C6AF722' : 'transparent' }}>
          <input type="checkbox" checked={inteiro} onChange={() => onAlternarProduto(produto)} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 600 }}>{produto}</span>
            <span style={subtexto}>
              {inteiro
                ? 'Produto inteiro — todas as ofertas contam, inclusive as novas'
                : `Marcar o produto inteiro · ${ofertas.length} oferta(s)`}
            </span>
          </span>
        </label>
      ) : (
        <p style={{ ...linha, cursor: 'default', margin: 0, fontWeight: 600 }}>{SEM_PRODUTO}</p>
      )}
      {ofertas.map((o) => {
        const marcada = inteiro || codigosMarcados.has(o.oferta_codigo)
        return (
          <label
            key={o.oferta_codigo}
            style={{
              ...linha,
              paddingLeft: 30,
              opacity: inteiro ? 0.55 : 1,
              cursor: inteiro ? 'default' : 'pointer',
              background: marcada && !inteiro ? 'var(--border)' : 'transparent',
            }}
          >
            <input
              type="checkbox"
              checked={marcada}
              disabled={inteiro}
              onChange={() => onAlternarOferta(o.oferta_codigo)}
            />
            <span style={{ flex: 1, minWidth: 0 }}>
              {o.oferta_nome || '(oferta sem nome)'}
              <span style={subtexto}>cód {o.oferta_codigo}</span>
            </span>
          </label>
        )
      })}
    </div>
  )
}

const linha: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  padding: '6px 8px',
  fontSize: 13,
  color: 'var(--text)',
  cursor: 'pointer',
  borderRadius: 6,
}

const subtexto: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 400,
  color: 'var(--text-faint)',
  marginTop: 2,
}

const campoBusca: React.CSSProperties = {
  width: '100%',
  background: 'var(--surface-2)',
  border: '1px solid var(--border-strong)',
  borderRadius: 8,
  padding: '9px 12px',
  color: 'var(--text)',
  fontSize: 13,
}

const listaRolavel: React.CSSProperties = {
  maxHeight: 380,
  overflowY: 'auto',
  border: '1px solid var(--border-strong)',
  borderRadius: 8,
  padding: 6,
  background: 'var(--surface-2)',
}

const textoVazio: React.CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: 'var(--text-faint)',
  padding: 12,
  textAlign: 'center',
}

const avisoErro: React.CSSProperties = {
  background: '#EF444422',
  border: '1px solid #EF444444',
  color: 'var(--text-error)',
  padding: '8px 12px',
  borderRadius: 8,
  fontSize: 12,
}

const botaoSecundario: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border-strong)',
  color: 'var(--text-muted)',
  padding: '9px 16px',
  borderRadius: 8,
  fontSize: 13,
  cursor: 'pointer',
}

const botaoPrimario: React.CSSProperties = {
  background: '#7C6AF7',
  border: 'none',
  color: '#fff',
  padding: '9px 18px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}
