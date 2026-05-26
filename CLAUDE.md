# LaunchMetrics — Guia do Claude Code

## O que é este projeto

Dashboard interno para gestão de lançamentos digitais e vendas. Usado por uma equipe de 2 a 5 pessoas. Integra com Go High Level (webhook de leads), Hotmart, PagMe e PagTrust (vendas).

## Regras que você DEVE seguir sempre

### Comportamento geral
- **Confirme antes de avançar** — ao terminar cada etapa importante, pergunte antes de ir para a próxima
- **Nunca apague arquivos existentes** sem avisar explicitamente o que vai ser removido e por quê
- **Prefira editar a reescrever** — se um arquivo já existe, edite só o necessário
- **Explique erros em português** — quando algo der errado, explique o que aconteceu em linguagem simples antes de tentar corrigir
- **Sempre rode os testes** após qualquer alteração em endpoints de API ou lógica de negócio

### Código
- Todo código novo deve ter **tipagem completa** — TypeScript no front, Pydantic no back
- **Sem hardcode** de URLs, chaves ou senhas — tudo via variáveis de ambiente (.env)
- Nomes de variáveis de domínio em **português** (lancamento, venda, lead, canal)
- Nomes técnicos em **inglês** (router, schema, handler, service, model)
- Funções com mais de 40 linhas devem ser **quebradas em funções menores**
- Sempre use **async/await** no FastAPI e nas queries ao banco

### Git
- Commits em português, no formato: `feat: adiciona endpoint de vendas`
- Prefixos: `feat:` (novo), `fix:` (correção), `refactor:` (melhoria), `docs:` (documentação)
- **Nunca faça commit de arquivos .env**

---

## Stack do projeto

### Front-end (pasta `/frontend`)
| Tecnologia | Uso |
|---|---|
| React 18 + Vite | Framework base |
| TypeScript | Tipagem |
| Tailwind CSS v3 | Estilização |
| shadcn/ui | Componentes (sobre Radix UI) |
| Recharts | Gráficos |
| React Router v6 | Roteamento |
| Zustand | Estado global |
| Axios | Chamadas à API |
| React Hook Form + Zod | Formulários e validação |
| date-fns | Manipulação de datas |

### Back-end (pasta `/backend`)
| Tecnologia | Uso |
|---|---|
| Python 3.11+ | Linguagem |
| FastAPI | Framework web |
| SQLAlchemy 2.0 async | ORM |
| Alembic | Migrations de banco |
| Pydantic v2 | Validação e schemas |
| Uvicorn + Gunicorn | Servidor WSGI/ASGI |
| python-dotenv | Variáveis de ambiente |

### Infraestrutura
| Serviço | Uso |
|---|---|
| Supabase | PostgreSQL + Auth (JWT) |
| Railway | Deploy do backend |
| Vercel | Deploy do frontend |

---

## Estrutura de pastas

```
launchmetrics/
├── CLAUDE.md                  ← este arquivo
├── README.md
├── .gitignore
│
├── frontend/
│   ├── src/
│   │   ├── components/        ← componentes reutilizáveis
│   │   │   ├── ui/            ← shadcn/ui gerado automaticamente
│   │   │   └── shared/        ← nossos componentes (KPICard, etc.)
│   │   ├── pages/             ← páginas completas
│   │   ├── hooks/             ← custom hooks (useVendas, useLancamento, etc.)
│   │   ├── store/             ← Zustand stores
│   │   ├── services/          ← funções de chamada à API (axios)
│   │   ├── types/             ← interfaces TypeScript
│   │   └── lib/               ← utilitários (formatBRL, formatDate, etc.)
│   ├── .env
│   ├── .env.example
│   └── vite.config.ts
│
├── backend/
│   ├── app/
│   │   ├── api/               ← routers FastAPI
│   │   │   ├── lancamentos.py
│   │   │   ├── leads.py
│   │   │   ├── vendas.py
│   │   │   └── webhooks.py
│   │   ├── models/            ← SQLAlchemy models (tabelas)
│   │   ├── schemas/           ← Pydantic schemas (request/response)
│   │   ├── services/          ← lógica de negócio (cálculo de CPL, ROAS, etc.)
│   │   ├── db/                ← sessão do banco, engine async
│   │   ├── middleware/        ← autenticação JWT Supabase
│   │   └── main.py            ← app FastAPI, CORS, registro de routers
│   ├── alembic/
│   ├── .env
│   ├── .env.example
│   └── requirements.txt
│
└── skills/                    ← skills customizadas para este projeto
    ├── fastapi-patterns/
    ├── supabase-auth/
    ├── ghl-webhook/
    └── dashboard-ui/
```

---

## Variáveis de ambiente obrigatórias

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

## Como rodar localmente

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env            # preencher as variáveis
alembic upgrade head            # rodar migrations
uvicorn app.main:app --reload   # http://localhost:8000
```

### Frontend
```bash
cd frontend
npm install
cp .env.example .env            # preencher as variáveis
npm run dev                     # http://localhost:5173
```

---

## Lógica de negócio — fórmulas importantes

```
CPL (Custo por Lead)    = investimento_canal / leads_canal
ROAS                    = receita_lancamento / investimento_total
Ticket médio            = receita_total / quantidade_de_vendas
% meta leads            = (leads_captados / meta_leads) * 100
% meta ROAS             = (roas_atual / meta_roas) * 100
```

Essas métricas devem ser **calculadas no backend**, nunca no frontend.

---

## Design system

| Token | Valor |
|---|---|
| Fundo principal | `#0B0F19` |
| Card/superfície | `#111827` |
| Bordas | `#1F2937` |
| Cor primária | `#7C6AF7` (roxo) |
| Sucesso/positivo | `#3ECFB2` (verde-água) |
| Atenção | `#F59E0B` (âmbar) |
| Erro/negativo | `#EF4444` (vermelho) |
| Texto primário | `#F9FAFB` |
| Texto secundário | `#6B7280` |

Todos os valores monetários: `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`
Todos os números: separador de milhar pt-BR

---

## Skills disponíveis neste projeto

Estão na pasta `/skills`. Consulte-as quando trabalhar nas áreas correspondentes:

- `skills/fastapi-patterns/` → padrões de routers, services, schemas e middleware
- `skills/supabase-auth/` → autenticação JWT, middleware FastAPI, login no frontend
- `skills/ghl-webhook/` → como receber e processar webhooks do Go High Level
- `skills/dashboard-ui/` → componentes de dashboard: KPICard, gráficos, filtros de data

---

## Ordem de implementação

1. Repositório + estrutura de pastas
2. Supabase: criar projeto, tabelas, usuários de teste
3. Backend: configurar FastAPI, banco, migrations, auth middleware
4. Backend: endpoints de lançamentos + webhook GHL
5. Backend: endpoints de vendas
6. Frontend: setup Vite + Tailwind + shadcn/ui + roteamento
7. Frontend: tela de login
8. Frontend: tela de lançamentos (lista + detalhe)
9. Frontend: dashboard de vendas
10. Deploy: Railway (backend) + Vercel (frontend)

---

## Perguntas frequentes

**Por que Python no backend se o frontend é JavaScript?**
A equipe tem preferência por Python. FastAPI é tão rápido quanto Node.js para este volume de dados.

**Por que Supabase e não um banco próprio?**
Supabase já inclui PostgreSQL gerenciado + autenticação pronta. Para 2-5 usuários, o plano gratuito é suficiente por meses.

**O webhook do GHL precisa autenticação?**
Sim — o token único na URL (`/webhooks/ghl/{token}`) identifica e autentica o lançamento. Não use autenticação JWT aqui pois o GHL não envia headers customizados facilmente.
