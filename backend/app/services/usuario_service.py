"""
Gestão de usuários e papéis.

Criar/remover usuários usa a API admin do Supabase Auth, que exige a
SUPABASE_SERVICE_KEY. O papel (admin/viewer) fica na tabela perfis.
"""
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import Perfil
from app.schemas.usuario import UsuarioCreate


class ServiceKeyAusente(Exception):
    """SUPABASE_SERVICE_KEY não configurada — não dá pra criar/remover usuário."""


class ErroSupabaseAdmin(Exception):
    """A API admin do Supabase recusou a operação."""


# ============================================================
# Papéis / leitura
# ============================================================
async def papel_do_usuario(db: AsyncSession, user_id: str) -> str | None:
    """Retorna 'admin' | 'viewer' | None (se não tem perfil)."""
    perfil = await db.get(Perfil, UUID(user_id))
    return perfil.papel if perfil else None


async def obter_perfil(db: AsyncSession, user_id: str) -> Perfil | None:
    return await db.get(Perfil, UUID(user_id))


async def listar(db: AsyncSession) -> list[Perfil]:
    stmt = select(Perfil).order_by(Perfil.criado_em)
    return list((await db.execute(stmt)).scalars().all())


# ============================================================
# Escrita (usa API admin do Supabase)
# ============================================================
async def criar(db: AsyncSession, dados: UsuarioCreate) -> Perfil:
    import httpx  # lazy: não quebra o import do app se httpx faltar no build

    if not settings.SUPABASE_SERVICE_KEY:
        raise ServiceKeyAusente()

    # 1. Cria o usuário no Supabase Auth
    url = f"{settings.SUPABASE_URL}/auth/v1/admin/users"
    headers = {
        "apikey": settings.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
        "Content-Type": "application/json",
    }
    body = {
        "email": dados.email,
        "password": dados.senha,
        "email_confirm": True,  # já confirma, sem email de verificação
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(url, headers=headers, json=body)
    if resp.status_code not in (200, 201):
        raise ErroSupabaseAdmin(f"{resp.status_code}: {resp.text[:300]}")

    user_id = resp.json().get("id")
    if not user_id:
        raise ErroSupabaseAdmin("resposta sem id de usuário")

    # 2. Cria o perfil
    perfil = Perfil(
        user_id=UUID(user_id),
        email=dados.email,
        nome=dados.nome,
        papel=dados.papel,
    )
    db.add(perfil)
    await db.commit()
    await db.refresh(perfil)
    return perfil


async def atualizar_papel(db: AsyncSession, user_id: str, papel: str) -> Perfil | None:
    perfil = await db.get(Perfil, UUID(user_id))
    if not perfil:
        return None
    perfil.papel = papel
    await db.commit()
    await db.refresh(perfil)
    return perfil


async def remover(db: AsyncSession, user_id: str) -> bool:
    import httpx  # lazy: não quebra o import do app se httpx faltar no build

    if not settings.SUPABASE_SERVICE_KEY:
        raise ServiceKeyAusente()

    perfil = await db.get(Perfil, UUID(user_id))
    if not perfil:
        return False

    # Remove do Supabase Auth
    url = f"{settings.SUPABASE_URL}/auth/v1/admin/users/{user_id}"
    headers = {
        "apikey": settings.SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SERVICE_KEY}",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.delete(url, headers=headers)
    if resp.status_code not in (200, 204):
        raise ErroSupabaseAdmin(f"{resp.status_code}: {resp.text[:300]}")

    await db.delete(perfil)
    await db.commit()
    return True
