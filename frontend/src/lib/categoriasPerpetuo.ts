import type { CategoriaPerpetuo } from '@/types'

/** Ordem das etapas do funil (filtro, selects, agrupamento, gráfico). */
export const ORDEM_CATEGORIAS_PERPETUO: CategoriaPerpetuo[] = [
  'Principal',
  'Order Bump',
  'Upsell',
  'UpUpsell',
  'Downsell',
  'Downsell 2',
  'Outros',
]

/** Nome que aparece na tela. O valor gravado no banco não muda —
 * "Principal" continua "Principal", só é exibido como "Front". */
export const ROTULO_CATEGORIA_PERPETUO: Record<CategoriaPerpetuo, string> = {
  Principal: 'Front',
  'Order Bump': 'Order Bump',
  Upsell: 'Upsell 1',
  UpUpsell: 'Upsell 2',
  Downsell: 'Downsell 1',
  'Downsell 2': 'Downsell 2',
  Outros: 'Outros',
}

export const COR_CATEGORIA_PERPETUO: Record<CategoriaPerpetuo, string> = {
  Principal: '#7C6AF7',
  'Order Bump': '#F59E0B',
  Upsell: '#60A5FA',
  UpUpsell: '#06B6D4',
  Downsell: '#EC4899',
  'Downsell 2': '#FB7185',
  Outros: '#6B7280',
}
