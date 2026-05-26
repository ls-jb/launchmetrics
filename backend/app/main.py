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
    """Endpoint de saúde — usado por load balancers."""
    return {"status": "ok", "environment": settings.ENVIRONMENT}
