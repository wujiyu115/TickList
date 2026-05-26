# -*- coding: utf-8 -*-

from collections import deque
from datetime import datetime, timezone


class DebugLogService:
    MAX_LOGS_PER_USER = 200

    def __init__(self):
        self._logs: dict[str, deque] = {}

    def add(self, user_id: str, tag: str, data: dict):
        if user_id not in self._logs:
            self._logs[user_id] = deque(maxlen=self.MAX_LOGS_PER_USER)
        self._logs[user_id].append({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "tag": tag,
            "data": data,
        })

    def get(self, user_id: str) -> list:
        return list(self._logs.get(user_id, []))

    def clear(self, user_id: str):
        self._logs.pop(user_id, None)


debug_log_service = DebugLogService()
