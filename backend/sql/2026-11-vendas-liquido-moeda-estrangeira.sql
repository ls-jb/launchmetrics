-- ============================================================
-- Vendas internacionais: líquido e bruto convertidos pra BRL
-- ============================================================
-- Complemento de 2026-11-vendas-valor-liquido.sql. Venda paga em dólar/
-- euro traz a comissão PRODUCER na moeda do comprador, mas a Hotmart
-- manda junto `currency_conversion` com o valor convertido pra BRL e o
-- câmbio usado. Aqui:
--   valor_liquido = converted_value (o que cai em reais)
--   valor_bruto   = full_price × conversion_rate
--
-- Só preenche linhas com o campo ainda nulo: nenhum valor existente muda.
-- ============================================================

-- Líquido: valor convertido pela própria Hotmart
update launchmetrics.vendas v
set valor_liquido = c.total
from (
    select v2.id,
           sum((com -> 'currency_conversion' ->> 'converted_value')::numeric) as total
    from launchmetrics.vendas v2,
         jsonb_array_elements(
             case
                 when jsonb_typeof(v2.payload_bruto -> 'data' -> 'commissions') = 'array'
                 then v2.payload_bruto -> 'data' -> 'commissions'
                 else '[]'::jsonb
             end
         ) as com
    where v2.plataforma = 'Hotmart'
      and v2.valor_liquido is null
      and com ->> 'source' = 'PRODUCER'
      and upper(coalesce(com ->> 'currency_value', 'BRL')) <> 'BRL'
      and upper(com -> 'currency_conversion' ->> 'converted_to_currency') = 'BRL'
      and com -> 'currency_conversion' ->> 'converted_value' is not null
    group by v2.id
) c
where v.id = c.id
  and v.valor_liquido is null;

-- Bruto: full_price na moeda do comprador × câmbio da comissão
update launchmetrics.vendas v
set valor_bruto = round(
        (v.payload_bruto -> 'data' -> 'purchase' -> 'full_price' ->> 'value')::numeric * c.taxa,
        2)
from (
    select v2.id,
           max((com -> 'currency_conversion' ->> 'conversion_rate')::numeric) as taxa
    from launchmetrics.vendas v2,
         jsonb_array_elements(
             case
                 when jsonb_typeof(v2.payload_bruto -> 'data' -> 'commissions') = 'array'
                 then v2.payload_bruto -> 'data' -> 'commissions'
                 else '[]'::jsonb
             end
         ) as com
    where v2.plataforma = 'Hotmart'
      and v2.valor_bruto is null
      and com ->> 'source' = 'PRODUCER'
      and upper(com -> 'currency_conversion' ->> 'converted_to_currency') = 'BRL'
      and com -> 'currency_conversion' ->> 'conversion_rate' is not null
      and upper(com ->> 'currency_value')
          = upper(v2.payload_bruto -> 'data' -> 'purchase' -> 'full_price' ->> 'currency_value')
    group by v2.id
) c
where v.id = c.id
  and v.valor_bruto is null
  and v.payload_bruto -> 'data' -> 'purchase' -> 'full_price' ->> 'value' is not null;
