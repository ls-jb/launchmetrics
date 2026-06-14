"""
Exporta os models para serem detectados pelo Alembic e disponibilizados nos
services. Importe daqui em vez de cada arquivo individual.
"""
from app.models.canal import Canal
from app.models.lancamento import Lancamento
from app.models.lancamento_pago import (
    LancamentoPago,
    LancamentoPagoAjuste,
    LancamentoPagoOferta,
)
from app.models.lead import Lead
from app.models.oferta_preco import OfertaPreco
from app.models.perfil import Perfil
from app.models.perpetuo import Perpetuo, PerpetuoProduto
from app.models.placar import (
    PlacarContagem,
    PlacarLancamento,
    PlacarOferta,
    PlacarVendedor,
)
from app.models.venda import Venda
from app.models.webhook_log import WebhookLog

__all__ = [
    "Canal",
    "Lancamento",
    "LancamentoPago",
    "LancamentoPagoAjuste",
    "LancamentoPagoOferta",
    "Lead",
    "OfertaPreco",
    "Perfil",
    "Perpetuo",
    "PerpetuoProduto",
    "PlacarContagem",
    "PlacarLancamento",
    "PlacarOferta",
    "PlacarVendedor",
    "Venda",
    "WebhookLog",
]
