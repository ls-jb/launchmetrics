import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db

security = HTTPBearer(auto_error=True)


def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """
    Valida o JWT emitido pelo Supabase Auth.

    Retorna o payload decodificado (inclui `sub` = user id, `email`, etc.)
    em caso de sucesso. Levanta 401 se o token for inválido ou expirado.
    """
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            audience="authenticated",
        )
        return payload
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expirado. Faça login novamente.",
        ) from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido.",
        ) from exc


async def require_admin(
    payload: dict = Depends(verify_token),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """
    Dependency que exige papel 'admin'. Usa o 'sub' do JWT pra buscar o perfil.
    Levanta 403 se não for admin.
    """
    # import local pra evitar import circular (service importa models/db)
    from app.services import usuario_service

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token sem identificação de usuário.")

    papel = await usuario_service.papel_do_usuario(db, user_id)
    if papel != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Apenas administradores podem fazer isso.",
        )
    return payload
