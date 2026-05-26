from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import lancamentos, vendas, webhooks
from app.core.config import settings

app = FastAPI(
    title="LaunchMetrics API",
    version="0.1.0",
    description="API interna para gestão de lançamentos digitais e vendas.",
)

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


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    """Endpoint de saúde — usado pelo Railway e por load balancers."""
    return {"status": "ok", "environment": settings.ENVIRONMENT}


@app.get("/api/debug-db", tags=["debug"])
async def debug_db() -> dict:
    """
    Endpoint TEMPORÁRIO de diagnóstico. SEM autenticação JWT para podermos
    debugar a conexão com o Supabase em produção. APAGAR depois de resolver.
    """
    import os
    import socket
    import time
    import traceback

    from sqlalchemy import text

    from app.db.session import engine

    info: dict = {"environment": settings.ENVIRONMENT}

    # 1) DNS resolution do host do DB
    db_url = os.environ.get("DATABASE_URL", "")
    host = (
        db_url.split("@", 1)[1].split(":", 1)[0]
        if "@" in db_url and ":" in db_url.split("@", 1)[1]
        else "?"
    )
    info["db_host"] = host
    try:
        t0 = time.perf_counter()
        ips = socket.gethostbyname_ex(host)[2]
        info["dns_resolved_ips"] = ips
        info["dns_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    except Exception as exc:
        info["dns_error"] = repr(exc)

    # 2) TCP raw connect na porta (sem TLS)
    try:
        port = int(db_url.rsplit(":", 1)[1].split("/", 1)[0])
        info["db_port"] = port
        t0 = time.perf_counter()
        with socket.create_connection((host, port), timeout=3):
            info["tcp_connect_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    except Exception as exc:
        info["tcp_error"] = repr(exc)

    # 3) SQLAlchemy + asyncpg connect + SELECT 1
    try:
        t0 = time.perf_counter()
        async with engine.connect() as conn:
            result = await conn.execute(text("select 1"))
            info["db_select_one"] = result.scalar_one()
        info["sqlalchemy_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    except Exception as exc:
        info["sqlalchemy_error"] = repr(exc)
        info["sqlalchemy_traceback"] = traceback.format_exc()

    return info
