# LaunchMetrics

Dashboard interno para gestão de **lançamentos digitais e vendas**. Integra leads do Go High Level (webhook) e vendas de Hotmart, PagMe e PagTrust em um painel unificado.

> Documentação técnica completa, regras de código e padrões do projeto em [CLAUDE.md](CLAUDE.md).

---

## Módulos

| Módulo | Status | Descrição |
|---|---|---|
| Lançamentos | Em desenvolvimento | Captação de leads via webhook do GHL, métricas por canal (CPL, ROAS) |
| Lançamento Pago | Coming soon | Placeholder |
| Dashboard de Vendas | Em desenvolvimento | Painel unificado das plataformas de venda |

---

## Stack

- **Front-end:** React 18 + Vite + TypeScript + Tailwind CSS + shadcn/ui + Recharts + Zustand
- **Back-end:** Python 3.11+ + FastAPI + SQLAlchemy 2.0 async + Pydantic v2 + Alembic
- **Infra:** Supabase (Postgres + Auth) · Railway (backend) · Vercel (frontend)

---

## Pré-requisitos

- Node.js 18 ou superior
- Python 3.11 ou superior
- Conta no Supabase (gratuita)

---

## Como rodar localmente

### 1. Clonar o repositório
```bash
git clone <url-do-repositorio>
cd launchmetrics
```

### 2. Backend
```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS / Linux:
source venv/bin/activate

# Instala deps de prod + dev (uvicorn, alembic, etc.)
pip install -r requirements-dev.txt
cp .env.example .env        # preencher as variáveis
uvicorn app.main:app --reload
```

> Em produção (Vercel) usa-se apenas `requirements.txt` (slim). Localmente,
> `requirements-dev.txt` adiciona uvicorn, alembic, httpx e ferramentas extra.

API disponível em http://localhost:8000 · documentação em http://localhost:8000/docs

### 3. Frontend
```bash
cd frontend
npm install
cp .env.example .env        # preencher as variáveis
npm run dev
```

App disponível em http://localhost:5173

---

## Estrutura do projeto

```
launchmetrics/
├── CLAUDE.md                 # guia do projeto (regras, stack, design system)
├── README.md
├── .gitignore
│
├── backend/
│   ├── app/
│   │   ├── api/              # routers FastAPI (lancamentos, vendas, webhooks)
│   │   ├── models/           # SQLAlchemy models
│   │   ├── schemas/          # Pydantic schemas
│   │   ├── services/         # lógica de negócio (CPL, ROAS, etc.)
│   │   ├── db/               # sessão async do banco
│   │   ├── middleware/       # autenticação JWT (Supabase)
│   │   ├── core/             # config / settings
│   │   └── main.py
│   ├── alembic/              # migrations
│   ├── .env.example
│   └── requirements.txt
│
├── frontend/
│   └── src/
│       ├── components/       # ui (shadcn) + shared (KPICard, gráficos)
│       ├── pages/            # telas completas
│       ├── hooks/            # custom hooks
│       ├── store/            # Zustand (auth, etc.)
│       ├── services/         # chamadas axios à API
│       ├── types/            # interfaces TypeScript
│       └── lib/              # utilitários (tokens, formatadores)
│
└── skills/                   # skills consultivas para o Claude Code
    ├── fastapi-patterns/
    ├── supabase-auth/
    ├── ghl-webhook/
    └── dashboard-ui/
```

---

## Variáveis de ambiente

### Backend (`backend/.env`)
```env
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/dbname
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_JWT_SECRET=sua-jwt-secret
SUPABASE_SERVICE_KEY=sua-service-key
CORS_ORIGINS=http://localhost:5173,https://seu-app.vercel.app
ENVIRONMENT=development
```

### Frontend (`frontend/.env`)
```env
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key
```

---

## Deploy

- **Backend** → Railway, conectando este repositório à pasta `/backend`. Configure as variáveis de ambiente e rode `alembic upgrade head` no primeiro deploy.
- **Frontend** → Vercel, apontando para `/frontend`. Configure as variáveis `VITE_*` no painel.

---

## Webhook do Go High Level

O GHL deve apontar para `https://api.seudominio.com/api/webhooks/ghl/{webhook_token}`. O token é gerado por lançamento e fica visível na tela de detalhe. Veja [skills/ghl-webhook/SKILL.md](skills/ghl-webhook/SKILL.md) para o passo a passo.

---

## Convenções

- Commits em português: `feat: adiciona endpoint de vendas`, `fix: corrige cálculo de CPL`
- Nomes de domínio em português (lancamento, venda, lead, canal); nomes técnicos em inglês (router, schema, service, model)
- Métricas calculadas sempre no **backend**, nunca no frontend
- `.env` nunca vai para o repositório
