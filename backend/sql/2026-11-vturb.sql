-- ============================================================
-- VSLs (VTurb) dos perpétuos
-- ============================================================
-- perpetuos_vturb_players: liga cada perpétuo às suas VSLs (players da
-- VTurb). Um perpétuo pode ter várias VSLs na mesma categoria (versões,
-- testes A/B), igual às ofertas.
--
-- vturb_cache: respostas brutas da API de Analytics da VTurb, com prazo
-- de validade. Evita estourar o limite por minuto do plano e deixa a tela
-- rápida. Linhas expiradas são apagadas pelo cron diário (/cron/sync-meta).
-- ============================================================

create table if not exists launchmetrics.perpetuos_vturb_players (
    id uuid primary key default gen_random_uuid(),
    perpetuo_id uuid not null
        references launchmetrics.perpetuos (id) on delete cascade,
    player_id text not null,
    player_nome text,
    categoria text not null check (categoria in (
        'Principal','Upsell','UpUpsell','Downsell'
    )),
    criado_em timestamptz not null default now(),
    unique (perpetuo_id, player_id)
);
create index if not exists ix_perp_vturb_players_perpetuo
    on launchmetrics.perpetuos_vturb_players (perpetuo_id);

create table if not exists launchmetrics.vturb_cache (
    chave text primary key,
    payload jsonb not null,
    expira_em timestamptz not null
);
create index if not exists ix_vturb_cache_expira
    on launchmetrics.vturb_cache (expira_em);

alter table launchmetrics.perpetuos_vturb_players enable row level security;
alter table launchmetrics.vturb_cache             enable row level security;
