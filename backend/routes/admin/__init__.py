# -*- coding: utf-8 -*-

from fastapi import APIRouter
from .users import router as users_router

admin_router = APIRouter(prefix='/api/admin', tags=['admin'])
admin_router.include_router(users_router)
