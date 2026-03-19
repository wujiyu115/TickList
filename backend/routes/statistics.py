# -*- coding: utf-8 -*-

from datetime import datetime, date, timedelta
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from middleware.jwt_middleware import get_current_user
from database.dao.statistics_dao import statistics_dao

router = APIRouter()

@router.get('/api/statistics/overview')
async def get_statistics_overview(
    current_user_id: str = Depends(get_current_user)
):
    """获取统计概览"""
    try:
        stats = statistics_dao.get_user_statistics(current_user_id)
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'获取统计概览失败: {str(e)}')

@router.get('/api/statistics/daily')
async def get_daily_statistics(
    date_str: str = Query(..., description="日期，格式：YYYY-MM-DD"),
    current_user_id: str = Depends(get_current_user)
):
    """获取每日统计"""
    try:
        target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        
        # 更新统计数据
        stats = statistics_dao.update_daily_statistics(current_user_id, target_date)
        return stats
    except ValueError:
        raise HTTPException(status_code=400, detail='日期格式错误，应为 YYYY-MM-DD')
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'获取每日统计失败: {str(e)}')

@router.get('/api/statistics/trend')
async def get_statistics_trend(
    days: int = Query(30, ge=1, le=365, description="天数"),
    current_user_id: str = Depends(get_current_user)
):
    """获取趋势数据"""
    try:
        trend_data = statistics_dao.get_completion_trend(current_user_id, days)
        return {
            'trend': trend_data,
            'days': days
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'获取趋势数据失败: {str(e)}')

@router.get('/api/statistics/range')
async def get_statistics_range(
    start_date: str = Query(..., description="开始日期，格式：YYYY-MM-DD"),
    end_date: str = Query(..., description="结束日期，格式：YYYY-MM-DD"),
    current_user_id: str = Depends(get_current_user)
):
    """获取时间范围内的统计"""
    try:
        start = datetime.strptime(start_date, '%Y-%m-%d').date()
        end = datetime.strptime(end_date, '%Y-%m-%d').date()
        
        if start > end:
            raise HTTPException(status_code=400, detail='开始日期不能晚于结束日期')
        
        stats = statistics_dao.get_statistics_by_date_range(current_user_id, start, end)
        return {
            'statistics': stats,
            'start_date': start_date,
            'end_date': end_date
        }
    except ValueError:
        raise HTTPException(status_code=400, detail='日期格式错误，应为 YYYY-MM-DD')
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'获取统计数据失败: {str(e)}')
