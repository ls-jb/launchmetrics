"""
Tipos compartilhados entre schemas. Mantém a tipagem consistente em todo o backend.
"""
from decimal import Decimal
from typing import Annotated

from pydantic import PlainSerializer

# Campos monetários: aceita Decimal/str/number no input, serializa como número
# float no output JSON. Mantém precisão interna em Decimal para operações.
Money = Annotated[
    Decimal,
    PlainSerializer(float, return_type=float, when_used="json-unless-none"),
]
