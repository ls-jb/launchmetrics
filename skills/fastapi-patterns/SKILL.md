---
name: fastapi-patterns
description: Padrões obrigatórios de FastAPI para o projeto LaunchMetrics. Use esta skill SEMPRE que for criar ou editar qualquer arquivo no backend: routers, schemas, services, models, middleware ou main.py. Também use ao resolver erros de banco de dados, CORS, ou autenticação no backend.
---

# Padrões FastAPI — LaunchMetrics

## Estrutura de um router

Todo router segue este padrão. Nunca coloque lógica de negócio diretamente no router — ela vai no `service`.

```python
# app/api/lancamentos.py
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_db
from app.middleware.auth import verify_token
from app.schemas.lancamento import LancamentoCreate, LancamentoResponse, LancamentoUpdate
from app.services import lancamento_service

router = APIRouter(prefix="/lancamentos", tags=["lancamentos"])

@router.get("/", response_model=list[LancamentoResponse])
async def listar_lancamentos(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    return await lancamento_service.listar(db)

@router.post("/", response_model=LancamentoResponse, status_code=status.HTTP_201_CREATED)
async def criar_lancamento(
    dados: LancamentoCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    return await lancamento_service.criar(db, dados)

@router.get("/{id}", response_model=LancamentoResponse)
async def obter_lancamento(
    id: UUID,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(verify_token),
):
    lancamento = await lancamento_service.obter(db, id)
    if not lancamento:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado")
    return lancamento
```

## Estrutura de um service

```python
# app/services/lancamento_service.py
from uuid import UUID, uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.lancamento import Lancamento
from app.schemas.lancamento import LancamentoCreate

async def listar(db: AsyncSession) -> list[Lancamento]:
    result = await db.execute(select(Lancamento).order_by(Lancamento.criado_em.desc()))
    return result.scalars().all()

async def criar(db: AsyncSession, dados: LancamentoCreate) -> Lancamento:
    lancamento = Lancamento(
        **dados.model_dump(),
        webhook_token=uuid4().hex,
    )
    db.add(lancamento)
    await db.commit()
    await db.refresh(lancamento)
    return lancamento

async def obter(db: AsyncSession, id: UUID) -> Lancamento | None:
    result = await db.execute(select(Lancamento).where(Lancamento.id == id))
    return result.scalar_one_or_none()
```

## Sessão do banco (async)

```python
# app/db/session.py
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from app.core.config import settings

engine = create_async_engine(settings.DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session
```

## Model SQLAlchemy (padrão do projeto)

```python
# app/models/lancamento.py
from uuid import uuid4
from datetime import datetime
from sqlalchemy import String, Integer, Numeric, Date, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class Lancamento(Base):
    __tablename__ = "lancamentos"

    id: Mapped[UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    nome: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, default="pre_lancamento")
    meta_leads: Mapped[int | None] = mapped_column(Integer)
    meta_roas: Mapped[float | None] = mapped_column(Numeric(10, 2))
    meta_receita: Mapped[float | None] = mapped_column(Numeric(12, 2))
    webhook_token: Mapped[str] = mapped_column(String, unique=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
```

## Schema Pydantic v2

```python
# app/schemas/lancamento.py
from uuid import UUID
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict

class LancamentoBase(BaseModel):
    nome: str
    status: str = "pre_lancamento"
    data_inicio: date | None = None
    data_fim: date | None = None
    meta_leads: int | None = None
    meta_roas: Decimal | None = None
    meta_receita: Decimal | None = None

class LancamentoCreate(LancamentoBase):
    pass

class LancamentoUpdate(LancamentoBase):
    nome: str | None = None

class LancamentoResponse(LancamentoBase):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    webhook_token: str
    criado_em: datetime
    # métricas calculadas (adicionadas pelo service)
    total_leads: int = 0
    investimento_total: Decimal = Decimal("0")
    cpl: Decimal = Decimal("0")
    roas: Decimal = Decimal("0")
```

## Configuração (settings)

```python
# app/core/config.py
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    DATABASE_URL: str
    SUPABASE_URL: str
    SUPABASE_JWT_SECRET: str
    SUPABASE_SERVICE_KEY: str
    CORS_ORIGINS: str = "http://localhost:5173"
    ENVIRONMENT: str = "development"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    class Config:
        env_file = ".env"

settings = Settings()
```

## main.py

```python
# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import lancamentos, vendas, webhooks

app = FastAPI(title="LaunchMetrics API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(lancamentos.router, prefix="/api")
app.include_router(vendas.router, prefix="/api")
app.include_router(webhooks.router, prefix="/api")

@app.get("/health")
async def health():
    return {"status": "ok"}
```

## Tratamento de erros padrão

```python
# Sempre use HTTPException com mensagens em português
raise HTTPException(status_code=404, detail="Lançamento não encontrado")
raise HTTPException(status_code=400, detail="Token do webhook inválido")
raise HTTPException(status_code=422, detail="Dados inválidos")
```

## Regras críticas

- **NUNCA** use `db.execute()` sem `await`
- **NUNCA** faça cálculos (CPL, ROAS) no router — vão nos services
- **SEMPRE** use `expire_on_commit=False` no sessionmaker para evitar lazy load errors
- **SEMPRE** feche a sessão com `async with` ou via `Depends(get_db)`
- Webhook do GHL deve retornar `{"status": "ok"}` mesmo em caso de erro parcial
