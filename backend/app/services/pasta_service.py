"""
Pastas da aba Lançamentos. Uma pasta só junta os dashboards do mesmo
lançamento (ex.: "Black" = dash de leads + dash de vendas da Black) pra
ficar fácil ver que eles andam juntos. Não tem métrica própria.
"""
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LancamentoPasta


async def listar(db: AsyncSession) -> list[LancamentoPasta]:
    stmt = select(LancamentoPasta).order_by(LancamentoPasta.criado_em.desc())
    return list((await db.execute(stmt)).scalars().all())


async def existe(db: AsyncSession, pasta_id: UUID) -> bool:
    return (await db.get(LancamentoPasta, pasta_id)) is not None


async def criar(db: AsyncSession, nome: str) -> LancamentoPasta:
    pasta = LancamentoPasta(nome=nome.strip())
    db.add(pasta)
    await db.commit()
    await db.refresh(pasta)
    return pasta


async def renomear(db: AsyncSession, pasta_id: UUID, nome: str) -> LancamentoPasta | None:
    pasta = await db.get(LancamentoPasta, pasta_id)
    if not pasta:
        return None
    pasta.nome = nome.strip()
    await db.commit()
    await db.refresh(pasta)
    return pasta


async def remover(db: AsyncSession, pasta_id: UUID) -> bool:
    """Apaga só a pasta. Os dashboards que estavam dentro continuam
    existindo, soltos (a FK é ON DELETE SET NULL)."""
    pasta = await db.get(LancamentoPasta, pasta_id)
    if not pasta:
        return False
    await db.delete(pasta)
    await db.commit()
    return True
