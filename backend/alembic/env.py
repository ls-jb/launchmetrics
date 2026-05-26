"""Alembic environment — usa engine async do projeto e Settings do .env."""
import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.core.config import settings
from app.db.base import Base

# IMPORTANTE: importar TODOS os models aqui para o Alembic detectá-los.
# Serão adicionados na etapa 4:
# from app.models import lancamento, canal, lead, venda  # noqa: F401

# Schema dedicado do projeto. Todas as tabelas vivem aqui, NÃO em "public"
# (que pode ser compartilhado com outras aplicações no mesmo projeto Supabase).
SCHEMA_PROJETO = "launchmetrics"

config = context.config

# Injeta a DATABASE_URL do .env do projeto
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def include_object(obj, name, type_, reflected, compare_to):
    """
    Faz o autogenerate gerenciar APENAS objetos no schema launchmetrics.
    Evita que ele tente criar/dropar tabelas de outros sistemas (auth.*,
    storage.*, public.customers, etc.).
    """
    if type_ in ("table", "index", "unique_constraint", "foreign_key_constraint"):
        schema = getattr(obj, "schema", None)
        if schema is None and hasattr(obj, "table"):
            schema = getattr(obj.table, "schema", None)
        return schema == SCHEMA_PROJETO
    return True


def run_migrations_offline() -> None:
    """Roda migrations sem se conectar — gera SQL puro."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        include_schemas=True,
        include_object=include_object,
        version_table_schema=SCHEMA_PROJETO,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        include_schemas=True,
        include_object=include_object,
        version_table_schema=SCHEMA_PROJETO,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """Cria engine async, executa migrations e fecha."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
