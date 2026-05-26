"""
Ponto de entrada para o Vercel Python runtime.
O Vercel detecta arquivos em /api e expõe o objeto `app` como ASGI handler.
Toda a aplicação fica em app/main.py — aqui é só re-export.
"""
from app.main import app

__all__ = ["app"]
