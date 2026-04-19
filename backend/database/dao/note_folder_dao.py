# -*- coding: utf-8 -*-

from typing import List, Optional, Dict
from datetime import datetime
from sqlalchemy import desc, asc
from database.connection import db_connection
from database.models import NoteFolderModel, NoteModel

class NoteFolderDAO:
    """笔记文件夹数据访问对象"""
    
    def _get_session(self):
        return db_connection.get_session()
    
    def _model_to_dict(self, model: NoteFolderModel) -> Optional[Dict]:
        """将 ORM 模型转换为字典"""
        if model is None:
            return None
        return {col.name: getattr(model, col.name) for col in model.__table__.columns}
    
    def create_folder(self, folder) -> Dict:
        """创建文件夹"""
        session = self._get_session()
        try:
            folder_dict = folder.to_dict()
            db_model = NoteFolderModel(**folder_dict)
            session.add(db_model)
            session.commit()
            return folder_dict
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def get_folder_by_id(self, user_id: str, folder_id: str) -> Optional[Dict]:
        """根据ID获取文件夹"""
        session = self._get_session()
        try:
            folder = session.query(NoteFolderModel).filter(
                NoteFolderModel.id == folder_id,
                NoteFolderModel.user_id == user_id
            ).first()
            return self._model_to_dict(folder)
        finally:
            session.close()
    
    def get_user_folders(
        self,
        user_id: str,
        parent_id: Optional[str] = None,
        skip: int = 0,
        limit: int = 100
    ) -> List[Dict]:
        """获取用户文件夹列表"""
        session = self._get_session()
        try:
            query = session.query(NoteFolderModel).filter(
                NoteFolderModel.user_id == user_id
            )
            
            if parent_id is not None:
                query = query.filter(NoteFolderModel.parent_id == parent_id)
            
            folders = query.order_by(
                asc(NoteFolderModel.order),
                desc(NoteFolderModel.created_at)
            ).offset(skip).limit(limit).all()
            
            return [self._model_to_dict(folder) for folder in folders]
        finally:
            session.close()
    
    def update_folder(self, user_id: str, folder_id: str, update_data: Dict) -> bool:
        """更新文件夹"""
        session = self._get_session()
        try:
            update_data['updated_at'] = datetime.now().isoformat()
            result = session.query(NoteFolderModel).filter(
                NoteFolderModel.id == folder_id,
                NoteFolderModel.user_id == user_id
            ).update(update_data)
            session.commit()
            return result > 0
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def delete_folder(self, user_id: str, folder_id: str) -> bool:
        """删除文件夹（级联删除子文件夹和笔记）"""
        session = self._get_session()
        try:
            # 递归获取所有子文件夹 ID
            folder_ids_to_delete = [folder_id]
            self._collect_child_folder_ids(session, user_id, folder_id, folder_ids_to_delete)
            
            # 删除所有相关笔记
            session.query(NoteModel).filter(
                NoteModel.user_id == user_id,
                NoteModel.folder_id.in_(folder_ids_to_delete)
            ).delete(synchronize_session='fetch')
            
            # 删除所有相关文件夹
            result = session.query(NoteFolderModel).filter(
                NoteFolderModel.user_id == user_id,
                NoteFolderModel.id.in_(folder_ids_to_delete)
            ).delete(synchronize_session='fetch')
            
            session.commit()
            return result > 0
        except Exception as e:
            session.rollback()
            raise e
        finally:
            session.close()
    
    def _collect_child_folder_ids(self, session, user_id: str, parent_id: str, result_ids: List[str]):
        """递归收集所有子文件夹 ID"""
        children = session.query(NoteFolderModel).filter(
            NoteFolderModel.user_id == user_id,
            NoteFolderModel.parent_id == parent_id
        ).all()
        for child in children:
            result_ids.append(child.id)
            self._collect_child_folder_ids(session, user_id, child.id, result_ids)
    
    def count_user_folders(self, user_id: str) -> int:
        """统计用户文件夹数量"""
        session = self._get_session()
        try:
            return session.query(NoteFolderModel).filter(
                NoteFolderModel.user_id == user_id
            ).count()
        finally:
            session.close()

# 全局实例
note_folder_dao = NoteFolderDAO()
