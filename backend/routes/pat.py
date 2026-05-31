# -*- coding: utf-8 -*-
import hashlib
import secrets
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from middleware.jwt_middleware import get_current_user
from database.dao.token_dao import token_dao

router = APIRouter(prefix="/api/auth", tags=["pat"])


class CreatePATRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)


class PATResponse(BaseModel):
    id: str
    name: str
    token: str
    created_at: str


class PATListItem(BaseModel):
    id: str
    name: str
    created_at: str
    last_used_at: str | None
    token_preview: str


def _generate_pat() -> str:
    """Generate tkl_ prefixed token with 40 hex chars"""
    return f"tkl_{secrets.token_hex(20)}"


def _hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


@router.post('/pat', response_model=PATResponse)
async def create_pat(
    request: CreatePATRequest,
    current_user_id: str = Depends(get_current_user),
):
    """Generate a new Personal Access Token. Token shown only once."""
    raw_token = _generate_pat()
    token_hash = _hash_token(raw_token)
    pat_id = f"pat-{secrets.token_hex(4)}"

    pat = token_dao.create_pat(
        user_id=current_user_id,
        token_hash=token_hash,
        name=request.name,
        pat_id=pat_id,
    )

    return PATResponse(
        id=pat['id'],
        name=pat['name'],
        token=raw_token,
        created_at=str(pat['created_at']),
    )


@router.get('/pat', response_model=list[PATListItem])
async def list_pats(
    current_user_id: str = Depends(get_current_user),
):
    """List all active PATs for current user (no full tokens exposed)."""
    pats = token_dao.list_user_pats(current_user_id)
    result = []
    for p in pats:
        preview = f"tkl_{'*' * 8}...{'*' * 4}"
        result.append(PATListItem(
            id=p['id'],
            name=p.get('name', ''),
            created_at=str(p['created_at']),
            last_used_at=p.get('last_used_at'),
            token_preview=preview,
        ))
    return result


@router.delete('/pat/{pat_id}', status_code=204)
async def delete_pat(
    pat_id: str,
    current_user_id: str = Depends(get_current_user),
):
    """Revoke a PAT."""
    pats = token_dao.list_user_pats(current_user_id)
    if not any(p['id'] == pat_id for p in pats):
        raise HTTPException(status_code=404, detail="PAT not found")

    token_dao.deactivate_token_by_jti(pat_id)
    return Response(status_code=204)
