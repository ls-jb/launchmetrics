-- ============================================================
-- LaunchMetrics — schema inicial (versão 2)
-- ============================================================
-- Cola este arquivo INTEIRO no SQL Editor do Supabase e roda
-- (Supabase Dashboard → SQL Editor → New query → Run).
--
-- NOTA: o estado real do banco do projeto já foi aplicado via
-- duas migrations do Supabase:
--   - schema_inicial
--   - isolar_em_schema_launchmetrics_e_habilitar_rls
-- Este arquivo é o "snapshot" do estado final — usado para
-- bootstrap em outros ambientes (dev local, novo Supabase, etc.)
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- SCHEMA dedicado
-- ============================================================
-- Mantemos nossas tabelas isoladas do schema "public" do projeto
-- Supabase (que pode ser compartilhado com outras aplicações).
-- Como "launchmetrics" não está nas schemas expostas pelo PostgREST,
-- as tabelas não ficam acessíveis via REST/anon key.
create schema if not exists launchmetrics;

-- ============================================================
-- LANCAMENTOS
-- ============================================================
create table if not exists launchmetrics.lancamentos (
    id uuid primary key default gen_random_uuid(),
    nome text not null,
    status text not null default 'pre_lancamento'
        check (status in ('pre_lancamento', 'captacao', 'carrinho', 'encerrado')),
    data_inicio date,
    data_fim date,
    meta_leads integer,
    meta_roas numeric(10, 2),
    meta_receita numeric(12, 2),
    webhook_token text not null unique,
    criado_em timestamptz not null default now()
);

create index if not exists ix_lancamentos_status on launchmetrics.lancamentos (status);
create index if not exists ix_lancamentos_criado_em on launchmetrics.lancamentos (criado_em desc);

-- ============================================================
-- CANAIS — agrupa leads e investimento por lançamento
-- ============================================================
create table if not exists launchmetrics.canais (
    id uuid primary key default gen_random_uuid(),
    lancamento_id uuid not null references launchmetrics.lancamentos (id) on delete cascade,
    nome text not null,
    investimento numeric(12, 2) not null default 0,
    criado_em timestamptz not null default now(),
    unique (lancamento_id, nome)
);

create index if not exists ix_canais_lancamento on launchmetrics.canais (lancamento_id);

-- ============================================================
-- LEADS — capturados pelo webhook do GHL
-- ============================================================
create table if not exists launchmetrics.leads (
    id uuid primary key default gen_random_uuid(),
    lancamento_id uuid not null references launchmetrics.lancamentos (id) on delete cascade,
    canal_id uuid references launchmetrics.canais (id) on delete set null,
    nome text,
    email text,
    telefone text,
    origem text,
    criado_em timestamptz not null default now()
);

create index if not exists ix_leads_lancamento on launchmetrics.leads (lancamento_id);
create index if not exists ix_leads_canal on launchmetrics.leads (canal_id);
create index if not exists ix_leads_criado_em on launchmetrics.leads (criado_em desc);
create index if not exists ix_leads_email_por_lancamento on launchmetrics.leads (lancamento_id, email);

-- ============================================================
-- VENDAS — Hotmart, Guru, PagMe, PagTrust e cadastro Manual (PIX direto etc.)
-- ============================================================
-- Cada linha representa UMA compra do cliente (não uma transação).
-- Split de cartão (R$1k + R$2k) vem como uma linha com valor=R$3k.
-- Recorrência mensal gera N linhas (uma por cobrança), mas no dashboard
-- só conta a primeira (recorrencia_seq = 1).
create table if not exists launchmetrics.vendas (
    id uuid primary key default gen_random_uuid(),

    -- Origem
    plataforma text not null
        check (plataforma in ('Hotmart', 'Guru', 'PagMe', 'PagTrust', 'Manual')),
    external_id text, -- id único na plataforma; NULL para vendas Manual

    -- O que foi vendido
    produto text not null,
    oferta text -- 'Principal' | 'Order Bump' | 'Upsell' | 'Downsell' (nullable para manual)
        check (oferta is null or oferta in ('Principal', 'Order Bump', 'Upsell', 'Downsell')),

    -- Como é a venda
    tipo text not null default 'unica'
        check (tipo in ('unica', 'recorrencia')),
    recorrencia_seq integer, -- 1, 2, 3... NULL para venda única
    assinatura_id text, -- id da assinatura na plataforma de origem
    metodo_pagamento text
        check (metodo_pagamento is null or metodo_pagamento in
            ('cartao', 'boleto', 'pix', 'transferencia', 'cartao_2x', 'outro')),

    -- Valores
    valor numeric(12, 2) not null,
    status text not null default 'aprovada'
        check (status in ('aprovada', 'pendente', 'cancelada', 'reembolsada')),

    -- Comprador
    comprador_nome text,
    comprador_email text,

    -- Datas
    data_venda timestamptz not null,
    criado_em timestamptz not null default now(),

    -- Auditoria
    payload_bruto jsonb,

    -- Coerência: recorrencia_seq só faz sentido com tipo=recorrencia
    constraint vendas_recorrencia_coerente check (
        (tipo = 'unica' and recorrencia_seq is null) or
        (tipo = 'recorrencia' and recorrencia_seq is not null and recorrencia_seq >= 1)
    )
);

-- Deduplicação: mesma venda (plataforma, external_id) chega N vezes do webhook
-- mas vira 1 linha só (UPSERT). Manual pode ter múltiplos external_id NULL.
create unique index if not exists ux_vendas_plataforma_external_id
    on launchmetrics.vendas (plataforma, external_id)
    where external_id is not null;

create index if not exists ix_vendas_data on launchmetrics.vendas (data_venda desc);
create index if not exists ix_vendas_produto on launchmetrics.vendas (produto);
create index if not exists ix_vendas_oferta on launchmetrics.vendas (oferta);
create index if not exists ix_vendas_plataforma on launchmetrics.vendas (plataforma);
create index if not exists ix_vendas_status on launchmetrics.vendas (status);
create index if not exists ix_vendas_tipo on launchmetrics.vendas (tipo);
create index if not exists ix_vendas_metodo on launchmetrics.vendas (metodo_pagamento);
create index if not exists ix_vendas_assinatura_id
    on launchmetrics.vendas (assinatura_id)
    where assinatura_id is not null;

-- ============================================================
-- ROW LEVEL SECURITY — defesa em profundidade
-- ============================================================
-- Mesmo o schema estando fora das schemas expostas pelo PostgREST,
-- habilitamos RLS sem policies para garantir que, se um dia
-- alguém adicionar "launchmetrics" às schemas expostas, o acesso
-- via anon/authenticated key ainda fica bloqueado.
-- O backend FastAPI conecta direto no Postgres (DATABASE_URL) e
-- usa o role postgres (superuser), que ignora RLS.
alter table launchmetrics.lancamentos enable row level security;
alter table launchmetrics.canais       enable row level security;
alter table launchmetrics.leads        enable row level security;
alter table launchmetrics.vendas       enable row level security;

-- ============================================================
-- DADOS DE EXEMPLO (opcional — apague esta seção em produção)
-- ============================================================
insert into launchmetrics.lancamentos
    (id, nome, status, data_inicio, data_fim, meta_leads, meta_roas, meta_receita, webhook_token)
values (
    '11111111-1111-1111-1111-111111111111',
    'Lançamento de Teste',
    'captacao',
    current_date - interval '7 days',
    current_date + interval '14 days',
    5000,
    4.0,
    300000,
    'token_de_teste_apague_em_producao'
)
on conflict (id) do nothing;

insert into launchmetrics.canais (lancamento_id, nome, investimento) values
    ('11111111-1111-1111-1111-111111111111', 'Meta Ads', 12000),
    ('11111111-1111-1111-1111-111111111111', 'Google Ads', 5000),
    ('11111111-1111-1111-1111-111111111111', 'Orgânico', 0)
on conflict (lancamento_id, nome) do nothing;

insert into launchmetrics.vendas
    (plataforma, produto, oferta, valor, comprador_nome, comprador_email, data_venda) values
    ('Hotmart',  'Método Acelerado', 'Principal',  997.00, 'Cliente 1', 'cli1@email.com', now() - interval '1 day'),
    ('Hotmart',  'Método Acelerado', 'Order Bump',  47.00, 'Cliente 1', 'cli1@email.com', now() - interval '1 day'),
    ('PagMe',    'Método Acelerado', 'Principal',  997.00, 'Cliente 2', 'cli2@email.com', now() - interval '3 days'),
    ('PagTrust', 'Workshop Vendas',  'Principal',  297.00, 'Cliente 3', 'cli3@email.com', now() - interval '5 days')
on conflict do nothing;

-- ============================================================
-- FIM
-- ============================================================
