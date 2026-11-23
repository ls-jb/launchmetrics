-- ============================================================
-- Lançamentos: Dashboard de Vendas + Pastas
-- ============================================================
-- A aba Lançamentos passa a ter dois tipos de dashboard:
--   'leads'  -> o que já existia (canais, webhook GHL, CPL)
--   'vendas' -> investimento digitado à mão + ofertas/produtos vendidos
--               pelo lançamento (receita, ROAS, ticket médio)
--
-- lancamentos_pastas: pasta que junta os dashboards do MESMO lançamento
-- (ex.: pasta "Black" com o dash de leads e o dash de vendas da Black).
--
-- lancamentos_ofertas: o que conta como venda de um dashboard de vendas.
--   oferta_codigo preenchido -> vínculo com UMA oferta
--   oferta_codigo nulo       -> vínculo com o PRODUTO inteiro (todas as
--                               ofertas dele, inclusive as criadas depois)
--
-- Só adiciona coisas: nenhum dado existente é alterado ou apagado. Todo
-- lançamento que já existe fica como tipo 'leads' e sem pasta.
-- ============================================================

create table if not exists launchmetrics.lancamentos_pastas (
    id uuid primary key default gen_random_uuid(),
    nome text not null,
    criado_em timestamptz not null default now()
);

alter table launchmetrics.lancamentos
    add column if not exists tipo text not null default 'leads'
        check (tipo in ('leads', 'vendas')),
    add column if not exists pasta_id uuid
        references launchmetrics.lancamentos_pastas (id) on delete set null,
    add column if not exists investimento_manual numeric(12, 2) not null default 0;

create index if not exists ix_lancamentos_pasta
    on launchmetrics.lancamentos (pasta_id);

create table if not exists launchmetrics.lancamentos_ofertas (
    id uuid primary key default gen_random_uuid(),
    lancamento_id uuid not null
        references launchmetrics.lancamentos (id) on delete cascade,
    produto text,
    oferta_codigo text,
    oferta_nome text,
    criado_em timestamptz not null default now(),
    check (produto is not null or oferta_codigo is not null)
);
create index if not exists ix_lancamentos_ofertas_lancamento
    on launchmetrics.lancamentos_ofertas (lancamento_id);

alter table launchmetrics.lancamentos_pastas  enable row level security;
alter table launchmetrics.lancamentos_ofertas enable row level security;
