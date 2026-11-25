import { KPICard } from '@/components/shared/KPICard'
import {
  COR_CATEGORIA_PERPETUO,
  ROTULO_CATEGORIA_PERPETUO,
} from '@/lib/categoriasPerpetuo'
import { formatBRLPreciso, formatNum } from '@/lib/tokens'
import type { ResumoPerpetuo } from '@/types'

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

/**
 * Blocos do topo do perpétuo. Todos os números vêm prontos do backend
 * (perpetuo_resumo_service) — aqui só formata e explica no (i).
 */
export function BlocosResumoPerpetuo({ resumo }: { resumo: ResumoPerpetuo }) {
  return (
    <div style={{ display: 'grid', gap: 12, marginBottom: '1.5rem' }}>
      <BlocosPrincipais resumo={resumo} />
      <BlocosCustos resumo={resumo} />
      <BlocosEtapas resumo={resumo} />
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
        dica="O que a Hotmart repassa: já sem a taxa da Hotmart e sem comissão de afiliado. Bate com a Receita Líquida da Hotmart. Reembolsos não entram."
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
 * alinhadas (mesmo nº de colunas). */
function BlocosEtapas({ resumo }: { resumo: ResumoPerpetuo }) {
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
          />
        ))}
      </div>
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
