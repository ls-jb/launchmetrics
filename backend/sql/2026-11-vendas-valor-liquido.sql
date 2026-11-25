-- ============================================================
-- Vendas: valor líquido e bruto reais (Hotmart)
-- ============================================================
-- valor_liquido: o que a Hotmart repassa ao produtor — soma das
--   commissions com source = 'PRODUCER' em BRL. Já sai sem a taxa da
--   Hotmart e sem a comissão de afiliado/coprodutor. A soma bate com a
--   "Receita Líquida" do relatório de vendas da Hotmart.
-- valor_bruto: o que o cliente pagou (full_price, com os juros do
--   parcelamento), só quando a moeda é BRL.
--
-- Nulo = payload sem esse dado (vendas antigas, compra em outra moeda,
-- outras plataformas). Nesses casos o dashboard volta pra estimativa.
--
-- Só adiciona colunas e preenche a partir do payload_bruto já gravado:
-- nenhum dado existente é alterado ou apagado.
-- ============================================================

alter table launchmetrics.vendas
    add column if not exists valor_bruto numeric(12, 2),
    add column if not exists valor_liquido numeric(12, 2);

-- Backfill: líquido = soma das commissions PRODUCER em BRL
update launchmetrics.vendas v
set valor_liquido = c.total
from (
    select v2.id, sum((com ->> 'value')::numeric) as total
    from launchmetrics.vendas v2,
         jsonb_array_elements(
             case
                 when jsonb_typeof(v2.payload_bruto -> 'data' -> 'commissions') = 'array'
                 then v2.payload_bruto -> 'data' -> 'commissions'
                 else '[]'::jsonb
             end
         ) as com
    where v2.plataforma = 'Hotmart'
      and com ->> 'source' = 'PRODUCER'
      and upper(coalesce(com ->> 'currency_value', 'BRL')) = 'BRL'
      and com ->> 'value' is not null
    group by v2.id
) c
where v.id = c.id
  and v.valor_liquido is null;

-- Backfill: bruto = full_price em BRL
update launchmetrics.vendas
set valor_bruto = (payload_bruto -> 'data' -> 'purchase' -> 'full_price' ->> 'value')::numeric
where plataforma = 'Hotmart'
  and valor_bruto is null
  and upper(coalesce(
        payload_bruto -> 'data' -> 'purchase' -> 'full_price' ->> 'currency_value',
        'BRL')) = 'BRL'
  and payload_bruto -> 'data' -> 'purchase' -> 'full_price' ->> 'value' is not null;
