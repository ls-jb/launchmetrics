import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings

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
