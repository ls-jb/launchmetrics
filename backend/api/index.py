"""
Ponto de entrada para o Vercel Python runtime.
O Vercel detecta arquivos em /api e expõe o objeto `app` como ASGI handler.

Envolvemos o import do app real num try/except: se ele falhar (ex: erro de
import específico do ambiente Vercel), expomos o traceback numa rota de
diagnóstico em vez de derrubar a função inteira sem mensagem. APAGAR o
fallback depois de resolver.
"""
try:
    from app.main import app
except Exception:  # noqa: BLE001
    import traceback

    _TB = traceback.format_exc()

    from fastapi import FastAPI

    app = FastAPI()

    @app.get("/_import_error")
    @app.get("/{caminho:path}")
    def _import_error(caminho: str = ""):
        return {"erro_de_import": _TB}


__all__ = ["app"]
