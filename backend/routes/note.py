# -*- coding: utf-8 -*-

from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
import uuid

from middleware.jwt_middleware import get_current_user
from database.dao.note_folder_dao import note_folder_dao
from database.dao.note_dao import note_dao
from models import NoteFolder, Note
from utils.logger import logger

router = APIRouter(prefix="/api", tags=["notes"])

# ========== Pydantic 请求模型 ==========

class NoteFolderCreate(BaseModel):
    name: str
    parent_id: Optional[str] = None
    color: str = '#1677ff'
    order: int = 0

class NoteFolderUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None
    color: Optional[str] = None
    order: Optional[int] = None

class NoteCreate(BaseModel):
    title: str
    content: str = ''
    folder_id: Optional[str] = None
    is_pinned: bool = False
    color: str = ''
    order: int = 0

class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    folder_id: Optional[str] = None
    is_pinned: Optional[bool] = None
    color: Optional[str] = None
    order: Optional[int] = None

class NoteMoveRequest(BaseModel):
    folder_id: Optional[str] = None

class ReorderItem(BaseModel):
    id: str
    order: int

# ========== 文件夹 API ==========

@router.post('/note-folders')
async def create_note_folder(
    data: NoteFolderCreate,
    current_user_id: str = Depends(get_current_user)
):
    """创建笔记文件夹"""
    try:
        folder = NoteFolder(
            id=str(uuid.uuid4()),
            name=data.name,
            user_id=current_user_id,
            parent_id=data.parent_id,
            color=data.color,
            order=data.order
        )
        result = note_folder_dao.create_folder(folder)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"创建笔记文件夹失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'创建笔记文件夹失败: {str(e)}')

@router.get('/note-folders')
async def get_note_folders(
    parent_id: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    current_user_id: str = Depends(get_current_user)
):
    """获取笔记文件夹列表"""
    try:
        folders = note_folder_dao.get_user_folders(
            user_id=current_user_id,
            parent_id=parent_id,
            skip=skip,
            limit=limit
        )
        return {
            'folders': folders,
            'total': note_folder_dao.count_user_folders(current_user_id)
        }
    except Exception as e:
        logger.error(f"获取笔记文件夹列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'获取笔记文件夹列表失败: {str(e)}')

@router.put('/note-folders/{folder_id}')
async def update_note_folder(
    folder_id: str,
    data: NoteFolderUpdate,
    current_user_id: str = Depends(get_current_user)
):
    """更新笔记文件夹"""
    try:
        existing = note_folder_dao.get_folder_by_id(current_user_id, folder_id)
        if not existing:
            raise HTTPException(status_code=404, detail='文件夹不存在')
        
        update_data = {}
        for field, value in data.dict(exclude_unset=True).items():
            if value is not None:
                update_data[field] = value
        
        success = note_folder_dao.update_folder(current_user_id, folder_id, update_data)
        if not success:
            raise HTTPException(status_code=500, detail='更新文件夹失败')
        
        updated = note_folder_dao.get_folder_by_id(current_user_id, folder_id)
        return updated
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新笔记文件夹失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'更新笔记文件夹失败: {str(e)}')

@router.delete('/note-folders/{folder_id}')
async def delete_note_folder(
    folder_id: str,
    current_user_id: str = Depends(get_current_user)
):
    """删除笔记文件夹（级联删除子文件夹和笔记）"""
    try:
        success = note_folder_dao.delete_folder(current_user_id, folder_id)
        if not success:
            raise HTTPException(status_code=404, detail='文件夹不存在')
        return {'message': '文件夹已删除'}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除笔记文件夹失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'删除笔记文件夹失败: {str(e)}')

@router.post('/note-folders/reorder')
async def reorder_note_folders(
    items: List[ReorderItem],
    current_user_id: str = Depends(get_current_user)
):
    """批量更新文件夹排序"""
    try:
        for item in items:
            existing = note_folder_dao.get_folder_by_id(current_user_id, item.id)
            if not existing:
                raise HTTPException(status_code=404, detail=f'文件夹 {item.id} 不存在')
            note_folder_dao.update_folder(current_user_id, item.id, {'order': item.order})
        return {'message': '排序已更新'}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"批量更新文件夹排序失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'批量更新文件夹排序失败: {str(e)}')

# ========== 笔记 API ==========

@router.post('/notes')
async def create_note(
    data: NoteCreate,
    current_user_id: str = Depends(get_current_user)
):
    """创建笔记"""
    try:
        note = Note(
            id=str(uuid.uuid4()),
            title=data.title,
            content=data.content,
            user_id=current_user_id,
            folder_id=data.folder_id,
            is_pinned=data.is_pinned,
            color=data.color,
            order=data.order
        )
        result = note_dao.create_note(note)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"创建笔记失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'创建笔记失败: {str(e)}')

@router.get('/notes')
async def get_notes(
    folder_id: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user_id: str = Depends(get_current_user)
):
    """获取笔记列表"""
    try:
        notes = note_dao.get_user_notes(
            user_id=current_user_id,
            folder_id=folder_id,
            skip=skip,
            limit=limit
        )
        return {
            'notes': notes,
            'total': note_dao.count_user_notes(current_user_id, folder_id)
        }
    except Exception as e:
        logger.error(f"获取笔记列表失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'获取笔记列表失败: {str(e)}')

@router.get('/notes/{note_id}')
async def get_note(
    note_id: str,
    current_user_id: str = Depends(get_current_user)
):
    """获取笔记详情"""
    note = note_dao.get_note_by_id(current_user_id, note_id)
    if not note:
        raise HTTPException(status_code=404, detail='笔记不存在')
    return note

@router.put('/notes/{note_id}')
async def update_note(
    note_id: str,
    data: NoteUpdate,
    current_user_id: str = Depends(get_current_user)
):
    """更新笔记"""
    try:
        existing = note_dao.get_note_by_id(current_user_id, note_id)
        if not existing:
            raise HTTPException(status_code=404, detail='笔记不存在')
        
        update_data = {}
        for field, value in data.dict(exclude_unset=True).items():
            if value is not None:
                update_data[field] = value
        
        success = note_dao.update_note(current_user_id, note_id, update_data)
        if not success:
            raise HTTPException(status_code=500, detail='更新笔记失败')
        
        updated = note_dao.get_note_by_id(current_user_id, note_id)
        return updated
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"更新笔记失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'更新笔记失败: {str(e)}')

@router.delete('/notes/{note_id}')
async def delete_note(
    note_id: str,
    current_user_id: str = Depends(get_current_user)
):
    """删除笔记"""
    try:
        success = note_dao.delete_note(current_user_id, note_id)
        if not success:
            raise HTTPException(status_code=404, detail='笔记不存在')
        return {'message': '笔记已删除'}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"删除笔记失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'删除笔记失败: {str(e)}')

@router.put('/notes/{note_id}/move')
async def move_note(
    note_id: str,
    data: NoteMoveRequest,
    current_user_id: str = Depends(get_current_user)
):
    """移动笔记到其他文件夹"""
    try:
        existing = note_dao.get_note_by_id(current_user_id, note_id)
        if not existing:
            raise HTTPException(status_code=404, detail='笔记不存在')
        
        # 如果指定了目标文件夹，验证其存在
        if data.folder_id:
            folder = note_folder_dao.get_folder_by_id(current_user_id, data.folder_id)
            if not folder:
                raise HTTPException(status_code=404, detail='目标文件夹不存在')
        
        success = note_dao.move_note(current_user_id, note_id, data.folder_id)
        if not success:
            raise HTTPException(status_code=500, detail='移动笔记失败')
        
        updated = note_dao.get_note_by_id(current_user_id, note_id)
        return updated
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"移动笔记失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'移动笔记失败: {str(e)}')

@router.post('/notes/reorder')
async def reorder_notes(
    items: List[ReorderItem],
    current_user_id: str = Depends(get_current_user)
):
    """批量更新笔记排序"""
    try:
        for item in items:
            existing = note_dao.get_note_by_id(current_user_id, item.id)
            if not existing:
                raise HTTPException(status_code=404, detail=f'笔记 {item.id} 不存在')
            note_dao.update_note(current_user_id, item.id, {'order': item.order})
        return {'message': '排序已更新'}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"批量更新笔记排序失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'批量更新笔记排序失败: {str(e)}')
