# -*- coding: utf-8 -*-

from typing import List, Optional, Dict
from datetime import datetime
from sqlalchemy import desc, asc
from database.connection import db_connection
from database.models import NoteModel

class NoteDAO:
    """笔记数据访问对象"""
    
    def _get_session(self):
        return db_connection.get_session()
    
    def _model_to_dict(self, model: NoteModel) -> Optional[Dict]:
        """将 ORM 模型转换为字典"""
        if model is None:
            return None
        return {col.name: getattr(model, col.name) for col in model.__table__.columns}
    
    def create_note(self, note) -> Dict:
        """创建笔记"""
        session = self._get_session()
        try:
            note_dict = note.to_dict()
            db_model = NoteModel(**note_dict)
            session.add(db_model)
            session.commit()
            return note_dict
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def get_note_by_id(self, user_id: str, note_id: str) -> Optional[Dict]:
        """根据ID获取笔记"""
        session = self._get_session()
        try:
            note = session.query(NoteModel).filter(
                NoteModel.id == note_id,
                NoteModel.user_id == user_id
            ).first()
            return self._model_to_dict(note)
        finally:
            session.close()
    
    def get_user_notes(
        self,
        user_id: str,
        folder_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 50
    ) -> List[Dict]:
        """获取用户笔记列表（支持按文件夹过滤）"""
        session = self._get_session()
        try:
            query = session.query(NoteModel).filter(
                NoteModel.user_id == user_id
            )
            
            if folder_id is not None:
                if folder_id == '':
                    # 空字符串表示未归类笔记
                    query = query.filter(NoteModel.folder_id == None)
                else:
                    query = query.filter(NoteModel.folder_id == folder_id)
            
            notes = query.order_by(
                desc(NoteModel.is_pinned),
                asc(NoteModel.order),
                desc(NoteModel.updated_at)
            ).offset(skip).limit(limit).all()
            
            return [self._model_to_dict(note) for note in notes]
        finally:
            session.close()
    
    def update_note(self, user_id: str, note_id: str, update_data: Dict) -> bool:
        """更新笔记"""
        session = self._get_session()
        try:
            update_data['updated_at'] = datetime.now().isoformat()
            result = session.query(NoteModel).filter(
                NoteModel.id == note_id,
                NoteModel.user_id == user_id
            ).update(update_data)
            session.commit()
            return result > 0
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def delete_note(self, user_id: str, note_id: str) -> bool:
        """删除笔记"""
        session = self._get_session()
        try:
            result = session.query(NoteModel).filter(
                NoteModel.id == note_id,
                NoteModel.user_id == user_id
            ).delete()
            session.commit()
            return result > 0
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def count_user_notes(self, user_id: str, folder_id: Optional[str] = None) -> int:
        """统计用户笔记数量"""
        session = self._get_session()
        try:
            query = session.query(NoteModel).filter(
                NoteModel.user_id == user_id
            )
            if folder_id is not None:
                if folder_id == '':
                    query = query.filter(NoteModel.folder_id == None)
                else:
                    query = query.filter(NoteModel.folder_id == folder_id)
            return query.count()
        finally:
            session.close()
    
    def count_notes_in_folder(self, user_id: str, folder_id: str) -> int:
        """统计文件夹内笔记数"""
        session = self._get_session()
        try:
            return session.query(NoteModel).filter(
                NoteModel.user_id == user_id,
                NoteModel.folder_id == folder_id
            ).count()
        finally:
            session.close()
    
    def move_note(self, user_id: str, note_id: str, target_folder_id: Optional[str]) -> bool:
        """移动笔记到其他文件夹"""
        session = self._get_session()
        try:
            update_data = {
                'folder_id': target_folder_id,
                'updated_at': datetime.now().isoformat()
            }
            result = session.query(NoteModel).filter(
                NoteModel.id == note_id,
                NoteModel.user_id == user_id
            ).update(update_data)
            session.commit()
            return result > 0
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()

# 全局实例
note_dao = NoteDAO()
