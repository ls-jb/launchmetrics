---
name: ghl-webhook
description: Implementação e troubleshooting do webhook do Go High Level (GHL) para captura automática de leads no projeto LaunchMetrics. Use esta skill SEMPRE que for criar, editar ou depurar o endpoint de webhook, ao mapear campos do GHL para o banco de dados, ou ao testar a chegada de leads. Também use se o GHL parar de enviar dados ou se leads não estiverem aparecendo no dashboard.
---

# Webhook Go High Level — LaunchMetrics

## Como funciona o fluxo

```
Pessoa se inscreve na página de captura
        ↓
Go High Level registra o contato
        ↓
GHL dispara POST para nossa URL:
  https://api.seudominio.com/api/webhooks/ghl/{webhook_token}
        ↓
FastAPI identifica o lançamento pelo token
        ↓
Salva o lead na tabela `leads` com o canal correto
        ↓
Retorna 200 OK imediatamente
```

---

## Endpoint FastAPI

```python
# app/api/webhooks.py
from fastapi import APIRouter, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends
from app.db.session import get_db
from app.services import webhook_service

router = APIRouter(prefix="/webhooks", tags=["webhooks"])

@router.post("/ghl/{token}")
async def receber_lead_ghl(
    token: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Recebe leads do Go High Level via webhook.
    Não exige autenticação JWT — o token na URL identifica o lançamento.
    DEVE retornar 200 imediatamente — GHL não faz retry bem.
    """
    try:
        payload = await request.json()
        await webhook_service.processar_lead_ghl(db, token, payload)
    except Exception as e:
        # Loga o erro mas retorna 200 para o GHL não marcar como falha
        print(f"[WEBHOOK ERROR] token={token} erro={str(e)}")

    return {"status": "ok"}
```

---

## Service de processamento

```python
# app/services/webhook_service.py
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.lancamento import Lancamento
from app.models.lead import Lead
from app.models.canal import Canal

async def processar_lead_ghl(db: AsyncSession, token: str, payload: dict) -> None:
    # 1. Encontrar o lançamento pelo token
    result = await db.execute(
        select(Lancamento).where(Lancamento.webhook_token == token)
    )
    lancamento = result.scalar_one_or_none()
    if not lancamento:
        raise ValueError(f"Lançamento não encontrado para token: {token}")

    # 2. Extrair campos do payload GHL
    nome = _extrair_nome(payload)
    email = payload.get("email") or payload.get("Email") or ""
    telefone = payload.get("phone") or payload.get("Phone") or ""
    canal_nome = _extrair_canal(payload)

    # 3. Encontrar ou criar o canal
    canal_id = await _obter_canal_id(db, lancamento.id, canal_nome)

    # 4. Salvar o lead
    lead = Lead(
        lancamento_id=lancamento.id,
        canal_id=canal_id,
        nome=nome,
        email=email,
        telefone=telefone,
        origem=canal_nome,
    )
    db.add(lead)
    await db.commit()


def _extrair_nome(payload: dict) -> str:
    first = payload.get("firstName") or payload.get("first_name") or ""
    last = payload.get("lastName") or payload.get("last_name") or ""
    full = payload.get("fullName") or payload.get("name") or ""
    return full or f"{first} {last}".strip() or "Sem nome"


def _extrair_canal(payload: dict) -> str:
    """
    Tenta extrair o canal de origem do lead.
    No GHL, o canal pode vir em campos customizados, tags, ou utm_source.
    """
    # Campo customizado "canal" ou "source"
    custom = payload.get("customField") or payload.get("custom_field") or {}
    if isinstance(custom, dict):
        canal = custom.get("canal") or custom.get("source") or ""
        if canal:
            return canal

    # UTM source
    utm = payload.get("utm_source") or payload.get("utmSource") or ""
    if utm:
        return utm

    # Tags (primeira tag como canal)
    tags = payload.get("tags") or []
    if tags and isinstance(tags, list):
        return tags[0]

    return "Orgânico"


async def _obter_canal_id(db: AsyncSession, lancamento_id, canal_nome: str):
    result = await db.execute(
        select(Canal).where(
            Canal.lancamento_id == lancamento_id,
            Canal.nome == canal_nome,
        )
    )
    canal = result.scalar_one_or_none()
    if not canal:
        canal = Canal(lancamento_id=lancamento_id, nome=canal_nome, investimento=0)
        db.add(canal)
        await db.flush()
    return canal.id
```

---

## Configurar no Go High Level

1. No GHL, vá em **Settings → Integrations → Webhooks**
2. Clique em **"Add Webhook"**
3. Configure:
   - **Name:** Nome do lançamento
   - **URL:** `https://api.seudominio.com/api/webhooks/ghl/{WEBHOOK_TOKEN}`
     *(o token aparece na tela de detalhe do lançamento no dashboard)*
   - **Method:** POST
   - **Events:** Contact Created, Form Submitted (ou o evento da sua página de captura)
4. Salve e teste com o botão "Send Test"

---

## Payload de exemplo do GHL

```json
{
  "contactId": "abc123",
  "firstName": "João",
  "lastName": "Silva",
  "email": "joao@email.com",
  "phone": "+5511999999999",
  "tags": ["meta-ads", "lancamento-maio"],
  "utm_source": "facebook",
  "utm_medium": "cpc",
  "utm_campaign": "lancamento-metodo-acelerado",
  "customField": {
    "canal": "Meta Ads"
  },
  "dateAdded": "2025-05-20T14:30:00Z"
}
```

---

## Mapeamento de canais

Os canais reconhecidos automaticamente pelo sistema:

| Valor no GHL (utm_source / tag / campo custom) | Canal no dashboard |
|---|---|
| `facebook`, `meta`, `meta-ads`, `instagram` | Meta Ads |
| `google`, `google-ads`, `googleads` | Google Ads |
| `whatsapp`, `wpp` | WhatsApp |
| `email`, `newsletter` | Email |
| `organic`, `organico`, `seo` | Orgânico |
| qualquer outro valor | valor original |
| vazio / não encontrado | Orgânico |

Adicione ao service um normalizador se quiser padronizar automaticamente.

---

## Testar o webhook localmente

Use o [ngrok](https://ngrok.com) para expor o servidor local:

```bash
# Terminal 1: rodar o backend
uvicorn app.main:app --reload

# Terminal 2: expor com ngrok
ngrok http 8000
# Copie a URL https gerada (ex: https://abc123.ngrok.io)
# Use como: https://abc123.ngrok.io/api/webhooks/ghl/{token}
```

Ou simule o payload manualmente:
```bash
curl -X POST http://localhost:8000/api/webhooks/ghl/SEU_TOKEN \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Teste","email":"teste@email.com","utm_source":"facebook"}'
```

---

## Checklist de problemas comuns

- **Lead não aparece** → verificar se o token na URL do GHL está correto
- **Lead aparece sem canal** → o campo utm_source ou customField não está chegando; verificar configuração do GHL
- **GHL marcando como erro** → verificar se o endpoint retorna 200 em qualquer situação (mesmo com exceção)
- **Leads duplicados** → GHL pode disparar o webhook mais de uma vez; considerar índice único em `email + lancamento_id`
