"""
Ponto de entrada para o Vercel Python runtime.

Diagnóstico: tentamos importar o app real. Se falhar, servimos o traceback
via um app ASGI PURO (sem nenhuma dependência além da stdlib), pra garantir
que conseguimos ver o erro mesmo que o problema seja no import do FastAPI.
APAGAR o fallback depois de resolver.
"""
import json
import sys
import traceback

_erro: str | None = None
try:
    from app.main import app as _real_app
except Exception:
    _erro = traceback.format_exc() + "\n\npython=" + sys.version


if _erro is None:
    app = _real_app
else:

    async def app(scope, receive, send):  # type: ignore[no-redef]
        if scope.get("type") != "http":
            return
        corpo = json.dumps(
            {"erro_de_import": _erro}, ensure_ascii=False
        ).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": 500,
                "headers": [(b"content-type", b"application/json; charset=utf-8")],
            }
        )
        await send({"type": "http.response.body", "body": corpo})


__all__ = ["app"]
