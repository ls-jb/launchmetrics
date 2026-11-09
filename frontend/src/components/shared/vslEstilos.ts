import type { CSSProperties } from 'react'

import type { CategoriaVsl } from '@/types'

/** Ordem e cores das categorias de VSL — mesmas cores das categorias de
 * oferta no gráfico de vendas do perpétuo. */
export const CATEGORIAS_VSL: CategoriaVsl[] = ['Principal', 'Upsell', 'UpUpsell', 'Downsell']

export const COR_CATEGORIA_VSL: Record<CategoriaVsl, string> = {
  Principal: '#7C6AF7',
  Upsell: '#60A5FA',
  UpUpsell: '#06B6D4',
  Downsell: '#EC4899',
}

export const COR_VIEWS = '#6B7280'
export const COR_PLAY_RATE = '#3ECFB2'
export const COR_ENGAJAMENTO = '#F59E0B'
// Cliques/conversões com cores próprias: não colidem com play rate (verde-água)
// nem com as cores das categorias (Upsell é azul).
export const COR_CLIQUES = '#E879F9'
export const COR_CONVERSOES = '#A3E635'
export const COR_PITCH = '#EF4444'

export const cartao: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '1.25rem',
}

export const gradeKpis: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
  gap: 12,
}

export const rotuloGrupo: CSSProperties = {
  margin: '0 0 8px',
  fontSize: 11,
  color: 'var(--text-faint)',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}

export const tituloSecaoVsl: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--text-strong)',
}

export const textoMudoVsl: CSSProperties = {
  fontSize: 13,
  color: 'var(--text-faint)',
}

export const botaoSecundarioVsl: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border-strong)',
  color: 'var(--text-muted)',
  padding: '7px 12px',
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
}

export const botaoPrimarioVsl: CSSProperties = {
  background: '#7C6AF7',
  border: 'none',
  color: '#fff',
  padding: '9px 16px',
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

export const inputVsl: CSSProperties = {
  width: '100%',
  background: 'var(--surface-2)',
  border: '1px solid var(--border-strong)',
  borderRadius: 8,
  padding: '9px 12px',
  color: 'var(--text)',
  fontSize: 13,
  colorScheme: 'dark',
}

export const selectVsl: CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border-strong)',
  borderRadius: 6,
  padding: '3px 6px',
  color: 'var(--text)',
  fontSize: 11,
  colorScheme: 'dark',
  cursor: 'pointer',
}

export const avisoErro: CSSProperties = {
  background: '#EF444411',
  border: '1px solid #EF444444',
  borderRadius: 8,
  padding: '10px 14px',
  color: 'var(--text-error)',
  fontSize: 13,
}

export const tooltipCaixa: CSSProperties = {
  background: 'var(--border)',
  border: '1px solid var(--border-strong)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 12,
}

export function pilulaCategoria(cor: string, ativa: boolean): CSSProperties {
  return {
    background: ativa ? `${cor}22` : 'transparent',
    border: `1px solid ${ativa ? cor : 'var(--border-strong)'}`,
    color: ativa ? cor : 'var(--text-faint)',
    borderRadius: 99,
    padding: '5px 12px',
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    cursor: 'pointer',
  }
}
