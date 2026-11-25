import { useState } from 'react'

import { KPICard } from '@/components/shared/KPICard'
import { Modal } from '@/components/shared/Modal'
import {
  COR_CATEGORIA_PERPETUO,
  ROTULO_CATEGORIA_PERPETUO,
} from '@/lib/categoriasPerpetuo'
import { formatBRLPreciso, formatNum } from '@/lib/tokens'
import type {
  CategoriaPerpetuo,
  PerpetuoOfertaDetalhe,
  ResumoPerpetuo,
} from '@/types'

const VERDE = '#3ECFB2'
const VERMELHO = '#EF4444'

/** Grid estilo Ratoeira: 2 colunas no celular, 5 no desktop. */
const GRID = 'grid grid-cols-2 lg:grid-cols-5 gap-3'

function pct(fracao: number): string {
  return `${(fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
}

function brlOuTraco(valor: number | null): string {
  return valor === null ? '—' : formatBRLPreciso(valor)
}

/** Linha de apoio do Faturamento Líquido quando há venda em dólar/euro:
 * deixa à vista o número que bate com o total em reais da Hotmart. */
function subInternacional(resumo: ResumoPerpetuo): string | undefined {
  const qtd = resumo.vendas_internacionais ?? 0
  if (qtd === 0) return undefined
  const emReais = resumo.faturamento_liquido - resumo.liquido_internacional
  const vendas = qtd === 1 ? '1 venda internacional' : `${formatNum(qtd)} vendas internacionais`
  return `Inclui ${formatBRLPreciso(resumo.liquido_internacional)} de ${vendas} · Hotmart em reais: ${formatBRLPreciso(emReais)}`
}

/**
 * Blocos do topo do perpétuo. Todos os números vêm prontos do backend
 * (perpetuo_resumo_service) — aqui só formata e explica no (i).
 */
export function BlocosResumoPerpetuo({
  resumo,
  ofertas,
}: {
  resumo: ResumoPerpetuo
  /** Ofertas cadastradas — alimentam o (?) de cada etapa do funil. */
  ofertas: PerpetuoOfertaDetalhe[]
}) {
  return (
    <div style={{ display: 'grid', gap: 12, marginBottom: '1.5rem' }}>
      <BlocosPrincipais resumo={resumo} />
      <BlocosCustos resumo={resumo} />
      <BlocosEtapas resumo={resumo} ofertas={ofertas} />
    </div>
  )
}

function BlocosPrincipais({ resumo }: { resumo: ResumoPerpetuo }) {
  const positivo = resumo.resultado >= 0
  return (
    <div className={GRID}>
      <KPICard
        label="Resultado"
        valor={formatBRLPreciso(resumo.resultado)}
        corValor={positivo ? VERDE : VERMELHO}
        dica="Faturamento Líquido − Custo Total"
      />
      <KPICard
        label="ROAS"
        valor={resumo.roas === null ? '—' : resumo.roas.toFixed(2)}
        corValor={resumo.roas === null ? 'var(--text-dim)' : '#7C6AF7'}
        dica="Faturamento Líquido ÷ (Custo de Anúncios + Taxa Meta)"
      />
      <KPICard
        label="CPA"
        valor={brlOuTraco(resumo.cpa)}
        dica="(Custo de Anúncios + Taxa Meta) ÷ Vendas Front"
      />
      <KPICard
        label="Ticket Médio"
        valor={brlOuTraco(resumo.ticket_medio)}
        dica="Faturamento Líquido ÷ Vendas Front"
      />
      <KPICard
        label="Faturamento Líquido"
        valor={formatBRLPreciso(resumo.faturamento_liquido)}
        corValor={VERDE}
        sub={subInternacional(resumo)}
        dica="O que a Hotmart repassa: já sem a taxa da Hotmart e sem comissão de afiliado. Bate com a Receita Líquida da Hotmart. Vendas em dólar/euro entram convertidas pra reais pelo câmbio da própria Hotmart (no relatório dela ficam fora do total em reais). Reembolsos não entram."
      />
    </div>
  )
}

function BlocosCustos({ resumo }: { resumo: ResumoPerpetuo }) {
  return (
    <div className={GRID}>
      <KPICard
        label="Faturamento Bruto"
        valor={formatBRLPreciso(resumo.faturamento_bruto)}
        dica="O que os clientes pagaram, com os juros do parcelamento."
      />
      <KPICard
        label="Custo Total"
        valor={formatBRLPreciso(resumo.custo_total)}
        dica="Custo de Anúncios + Impostos Totais. A taxa da Hotmart não entra: ela já saiu do Faturamento Líquido."
      />
      <KPICard
        label="Custo de Anúncios"
        valor={formatBRLPreciso(resumo.custo_anuncios)}
        corValor="#F59E0B"
        dica="Gasto na Meta Ads (sincroniza a cada 30 min) + aportes manuais."
      />
      <KPICard
        label="Impostos Totais"
        valor={formatBRLPreciso(resumo.impostos_totais)}
        dica="Taxa Meta + Taxa Empresa"
      />
      <KPICard
        label="Taxas Hotmart"
        valor={formatBRLPreciso(resumo.taxas_hotmart)}
        corValor="var(--text-dim)"
        dica="Taxa da Hotmart + comissão de afiliados. Só informativo: já descontadas do Faturamento Líquido."
      />
      <KPICard
        label={`Taxa Meta (${pct(resumo.pct_taxa_meta)})`}
        valor={formatBRLPreciso(resumo.taxa_meta)}
        dica={`${pct(resumo.pct_taxa_meta)} sobre o Custo de Anúncios.`}
      />
      <KPICard
        label={`Taxa Empresa (${pct(resumo.pct_taxa_empresa)})`}
        valor={formatBRLPreciso(resumo.taxa_empresa)}
        dica={`${pct(resumo.pct_taxa_empresa)} sobre o valor das vendas (preço pago pela oferta, sem os juros do parcelamento).`}
      />
    </div>
  )
}

/** Uma linha com a qtd de vendas por etapa e outra com o valor líquido,
 * alinhadas (mesmo nº de colunas). O (?) de cada etapa abre as ofertas
 * dela, pra deixar claro o que é Upsell 1, Downsell 2 etc. */
function BlocosEtapas({
  resumo,
  ofertas,
}: {
  resumo: ResumoPerpetuo
  ofertas: PerpetuoOfertaDetalhe[]
}) {
  const [etapaAberta, setEtapaAberta] = useState<CategoriaPerpetuo | null>(null)
  if (resumo.por_categoria.length === 0) return null
  const colunas = {
    gridTemplateColumns: `repeat(auto-fit, minmax(150px, 1fr))`,
  }
  return (
    <>
      <div className="grid gap-3" style={colunas}>
        {resumo.por_categoria.map((e) => (
          <KPICard
            key={`qtd-${e.categoria}`}
            label={`Vendas ${ROTULO_CATEGORIA_PERPETUO[e.categoria]}`}
            valor={formatNum(e.quantidade)}
            corValor={COR_CATEGORIA_PERPETUO[e.categoria]}
            onAjuda={() => setEtapaAberta(e.categoria)}
            tituloAjuda="Ver produto e ofertas dessa etapa"
          />
        ))}
      </div>
      <Modal
        aberto={etapaAberta !== null}
        titulo={etapaAberta ? `${ROTULO_CATEGORIA_PERPETUO[etapaAberta]} — ofertas` : ''}
        onFechar={() => setEtapaAberta(null)}
        largura={560}
      >
        {etapaAberta && (
          <OfertasDaEtapa ofertas={ofertas.filter((o) => o.categoria === etapaAberta)} />
        )}
      </Modal>
      <div className="grid gap-3" style={colunas}>
        {resumo.por_categoria.map((e) => (
          <KPICard
            key={`valor-${e.categoria}`}
            label={`Valor ${ROTULO_CATEGORIA_PERPETUO[e.categoria]}`}
            valor={formatBRLPreciso(e.valor)}
            dica="Faturamento líquido das vendas dessa etapa."
          />
        ))}
      </div>
    </>
  )
}

/** Ticket da oferta: preço cadastrado; sem ele, a média paga no período. */
function ticketDaOferta(o: PerpetuoOfertaDetalhe): string {
  if (o.preco_oferta !== null && o.preco_oferta !== undefined) {
    return formatBRLPreciso(o.preco_oferta)
  }
  if (o.quantidade > 0) {
    return `${formatBRLPreciso(o.valor_vendas / o.quantidade)} (média)`
  }
  return '—'
}

/** Conteúdo do pop-up do (?): ofertas da etapa agrupadas por produto. */
function OfertasDaEtapa({ ofertas }: { ofertas: PerpetuoOfertaDetalhe[] }) {
  if (ofertas.length === 0) {
    return <p style={{ margin: 0, fontSize: 13, color: 'var(--text-faint)' }}>Nenhuma oferta nessa etapa.</p>
  }
  const porProduto = new Map<string, PerpetuoOfertaDetalhe[]>()
  for (const o of ofertas) {
    const produto = o.produto ?? 'Produto sem venda ainda'
    porProduto.set(produto, [...(porProduto.get(produto) ?? []), o])
  }
  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {[...porProduto.entries()].map(([produto, lista]) => (
        <div key={produto}>
          <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
            {produto}
          </p>
          <div style={{ display: 'grid', gap: 6 }}>
            {lista.map((o) => (
              <LinhaOferta key={o.id} oferta={o} />
            ))}
          </div>
        </div>
      ))}
      <p style={{ margin: 0, fontSize: 11, color: 'var(--text-faint)' }}>
        Ticket = preço cadastrado da oferta (ou a média paga no período, quando não há preço
        cadastrado). Vendas = no período filtrado.
      </p>
    </div>
  )
}

function LinhaOferta({ oferta: o }: { oferta: PerpetuoOfertaDetalhe }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        padding: '8px 12px',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        opacity: o.oculta ? 0.6 : 1,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text)' }}>
          {o.oferta_nome ?? o.oferta_codigo}
          {o.oculta ? ' (oculta)' : ''}
        </p>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-faint)' }}>
          cód: {o.oferta_codigo} · {formatNum(o.quantidade)}{' '}
          {o.quantidade === 1 ? 'venda' : 'vendas'}
        </p>
      </div>
      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap' }}>
        {ticketDaOferta(o)}
      </p>
    </div>
  )
}
