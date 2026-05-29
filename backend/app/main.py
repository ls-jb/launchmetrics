import asyncio
import sys

# psycopg async não convive com o ProactorEventLoop padrão do Windows.
# Em produção (Linux) isso não aplica.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402

from app.api import lancamentos, placar, usuarios, vendas, webhooks  # noqa: E402
from app.core.config import settings  # noqa: E402

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
app.include_router(usuarios.router, prefix="/api")
app.include_router(placar.router, prefix="/api")


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    """Endpoint de saúde — usado por load balancers."""
    return {"status": "ok", "environment": settings.ENVIRONMENT}
