# -*- coding: utf-8 -*-

from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Query
from middleware.jwt_middleware import get_current_user
from database.dao.task_dao import task_dao
from utils.logger import logger

router = APIRouter()

@router.get('/api/calendar/tasks')
async def get_calendar_tasks(
    start_date: str = Query(..., description="开始日期，格式：YYYY-MM-DD"),
    end_date: str = Query(..., description="结束日期，格式：YYYY-MM-DD"),
    current_user_id: str = Depends(get_current_user)
):
    """获取日历任务
    
    获取指定日期范围内有截止日期的任务
    """
    try:
        start = datetime.strptime(start_date, '%Y-%m-%d')
        end = datetime.strptime(end_date, '%Y-%m-%d')
        
        # 验证日期范围
        if start > end:
            raise HTTPException(status_code=400, detail='开始日期不能晚于结束日期')
        
        # 限制查询范围（最多1年）
        if (end - start).days > 366:
            raise HTTPException(status_code=400, detail='日期范围不能超过一年')
        
        tasks = task_dao.get_tasks_by_due_date(current_user_id, start, end)
        
        logger.info(f"获取日历任务: user_id={current_user_id}, start={start_date}, end={end_date}, count={len(tasks)}")
        
        return {
            'tasks': tasks,
            'total': len(tasks)
        }
    except ValueError:
        raise HTTPException(status_code=400, detail='日期格式错误，应为 YYYY-MM-DD')
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"获取日历任务失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f'获取日历任务失败: {str(e)}')
