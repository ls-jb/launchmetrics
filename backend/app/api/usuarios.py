from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.middleware.auth import require_admin, verify_token
from app.schemas.usuario import (
    MeuPerfilResponse,
    UsuarioCreate,
    UsuarioResponse,
    UsuarioUpdatePapel,
)
from app.services import usuario_service

router = APIRouter(prefix="/usuarios", tags=["usuarios"])


@router.get("/me", response_model=MeuPerfilResponse)
async def meu_perfil(
    payload: dict = Depends(verify_token),
    db: AsyncSession = Depends(get_db),
):
    """Perfil do usuário logado. Se não tem perfil, assume viewer."""
    user_id = payload.get("sub")
    perfil = await usuario_service.obter_perfil(db, user_id)
    if not perfil:
        # usuário autenticado mas sem perfil cadastrado → viewer por padrão
        return MeuPerfilResponse(
            user_id=UUID(user_id),
            email=payload.get("email", ""),
            nome=None,
            papel="viewer",
        )
    return MeuPerfilResponse(
        user_id=perfil.user_id,
        email=perfil.email,
        nome=perfil.nome,
        papel=perfil.papel,  # type: ignore[arg-type]
    )


@router.get("", response_model=list[UsuarioResponse])
async def listar_usuarios(
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    return await usuario_service.listar(db)


@router.post("", response_model=UsuarioResponse, status_code=status.HTTP_201_CREATED)
async def criar_usuario(
    dados: UsuarioCreate,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    try:
        return await usuario_service.criar(db, dados)
    except usuario_service.ServiceKeyAusente as exc:
        raise HTTPException(
            status_code=503,
            detail="SUPABASE_SERVICE_KEY não configurada no servidor. Não é possível criar usuários.",
        ) from exc
    except usuario_service.ErroSupabaseAdmin as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Erro ao criar usuário no Supabase: {exc}",
        ) from exc


@router.patch("/{user_id}", response_model=UsuarioResponse)
async def atualizar_papel_usuario(
    user_id: str,
    dados: UsuarioUpdatePapel,
    db: AsyncSession = Depends(get_db),
    _: dict = Depends(require_admin),
):
    perfil = await usuario_service.atualizar_papel(db, user_id, dados.papel)
    if not perfil:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    return perfil


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remover_usuario(
    user_id: str,
    payload: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    if payload.get("sub") == user_id:
        raise HTTPException(status_code=400, detail="Você não pode remover a si mesmo.")
    try:
        sucesso = await usuario_service.remover(db, user_id)
    except usuario_service.ServiceKeyAusente as exc:
        raise HTTPException(
            status_code=503,
            detail="SUPABASE_SERVICE_KEY não configurada no servidor.",
        ) from exc
    except usuario_service.ErroSupabaseAdmin as exc:
        raise HTTPException(status_code=400, detail=f"Erro no Supabase: {exc}") from exc
    if not sucesso:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")