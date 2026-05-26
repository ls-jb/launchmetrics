from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from app.core.config import settings

# Em produção (Vercel serverless) usamos NullPool: cada request abre e fecha
# sua própria conexão. O pgbouncer do Supabase faz o pooling de verdade
# (porta 6543, transaction mode). Pool local em serverless não compartilha
# conexões entre invocations e só gera overhead.
# Em dev local, mantemos o pool padrão do SQLAlchemy.
_pool_kwargs = (
    {"poolclass": NullPool}
    if not settings.is_development
    else {"pool_pre_ping": True}
)

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.is_development,
    # asyncpg + pgbouncer (transaction mode) não convivem com prepared statements.
    # Desabilitar o cache evita erros "prepared statement does not exist" e
    # "another prepared statement with that name already exists".
    connect_args={
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
        # Falha em 5s em vez de hangar 10s+. Em serverless preferimos erro
        # rápido visível nos logs do que timeout do runtime.
        "timeout": 5,
    },
    **_pool_kwargs,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency do FastAPI: cede uma sessão async e garante o fechamento."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
