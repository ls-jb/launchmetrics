"""
Script de entrada pra rodar o backend localmente.

Use: python run_dev.py

Necessário no Windows porque o psycopg async não convive com o
ProactorEventLoop (padrão do Python no Windows). Esta forma de iniciar
garante que a policy do asyncio é trocada ANTES do uvicorn criar o loop.

Em produção (Vercel/Linux) isso não é necessário, e este arquivo nem é usado.
"""
import asyncio
import sys

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import uvicorn  # noqa: E402

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        reload=True,
    )
