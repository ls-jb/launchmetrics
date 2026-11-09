"""
Cache das respostas da API de Analytics da VTurb.

Cada linha guarda a resposta bruta de uma consulta (chave = caminho +
corpo da requisição) até `expira_em`. Linhas vencidas são ignoradas na
leitura e apagadas pelo cron diário.
"""
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class VturbCache(Base):
    __tablename__ = "vturb_cache"
    __table_args__ = {"schema": "launchmetrics"}

    chave: Mapped[str] = mapped_column(String, primary_key=True)
    payload: Mapped[Any] = mapped_column(JSONB, nullable=False)
    expira_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
