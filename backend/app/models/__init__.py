"""
Exporta os models para serem detectados pelo Alembic e disponibilizados nos
services. Importe daqui em vez de cada arquivo individual.
"""
from app.models.canal import Canal
from app.models.lancamento import Lancamento
from app.models.lead import Lead
from app.models.venda import Venda

__all__ = ["Canal", "Lancamento", "Lead", "Venda"]
