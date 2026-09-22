import os
import sys
import tempfile
import unittest
from datetime import datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker


BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from database import models as database_models  # noqa: F401
from database.connection import Base, db_connection
from database.dao.task_dao import task_dao
from models import Task


class TaskDateFilterTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original_engine = db_connection.engine
        cls.original_session_local = db_connection.SessionLocal

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = os.path.join(self.temp_dir.name, "ticklist-test.db")

        engine = create_engine(
            f"sqlite:///{self.db_path}",
            echo=False,
            connect_args={"check_same_thread": False},
        )
        db_connection.engine = engine
        db_connection.SessionLocal = sessionmaker(
            bind=engine,
            autocommit=False,
            autoflush=False,
        )
        Base.metadata.create_all(engine)

    def tearDown(self):
        Base.metadata.drop_all(db_connection.engine)
        db_connection.engine.dispose()
        db_connection.engine = self.original_engine
        db_connection.SessionLocal = self.original_session_local
        self.temp_dir.cleanup()

    def test_date_range_includes_tasks_filtered_by_due_date(self):
        user_id = "user-1"
        task_dao.create_task(
            Task(
                id="task-due-today",
                title="Due today",
                user_id=user_id,
                due_date=datetime(2026, 4, 8, 20, 0, 0),
                content='',
            )
        )
        task_dao.create_task(
            Task(
                id="task-due-tomorrow",
                title="Due tomorrow",
                user_id=user_id,
                due_date=datetime(2026, 4, 9, 20, 0, 0),
                content='',
            )
        )

        tasks = task_dao.get_user_tasks(
            user_id=user_id,
            start_date=datetime(2026, 4, 8, 0, 0, 0),
            end_date=datetime(2026, 4, 9, 0, 0, 0),
            limit=100,
        )

        task_ids = {task["id"] for task in tasks}
        self.assertIn("task-due-today", task_ids)
        self.assertNotIn("task-due-tomorrow", task_ids)

    def test_date_range_keeps_start_time_fallback_when_due_date_missing(self):
        user_id = "user-2"
        task_dao.create_task(
            Task(
                id="task-start-today",
                title="Start today",
                user_id=user_id,
                start_time=datetime(2026, 4, 8, 9, 0, 0),
                content='',
            )
        )

        tasks = task_dao.get_user_tasks(
            user_id=user_id,
            start_date=datetime(2026, 4, 8, 0, 0, 0),
            end_date=datetime(2026, 4, 9, 0, 0, 0),
            limit=100,
        )

        task_ids = {task["id"] for task in tasks}
        self.assertIn("task-start-today", task_ids)

    def test_date_range_count_uses_due_date_rules(self):
        user_id = "user-3"
        task_dao.create_task(
            Task(
                id="task-due-in-range",
                title="Due in range",
                user_id=user_id,
                due_date=datetime(2026, 4, 8, 23, 59, 0),
                content='',
            )
        )
        task_dao.create_task(
            Task(
                id="task-due-on-end-boundary",
                title="Due on end boundary",
                user_id=user_id,
                due_date=datetime(2026, 4, 9, 0, 0, 0),
                content='',
            )
        )

        count = task_dao.count_user_tasks(
            user_id=user_id,
            start_date=datetime(2026, 4, 8, 0, 0, 0),
            end_date=datetime(2026, 4, 9, 0, 0, 0),
        )

        self.assertEqual(count, 1)


    def test_include_overdue_returns_pending_task_due_before_range(self):
        """今天视图开启 include_overdue 时，逾期未完成任务仍需出现"""
        user_id = "user-4"
        task_dao.create_task(
            Task(
                id="task-overdue",
                title="Overdue pending",
                user_id=user_id,
                due_date=datetime(2026, 4, 7, 20, 0, 0),
                content='',
            )
        )
        task_dao.create_task(
            Task(
                id="task-future",
                title="Future pending",
                user_id=user_id,
                due_date=datetime(2026, 4, 10, 20, 0, 0),
                content='',
            )
        )

        tasks = task_dao.get_user_tasks(
            user_id=user_id,
            exclude_status="completed",
            start_date=datetime(2026, 4, 8, 0, 0, 0),
            end_date=datetime(2026, 4, 9, 0, 0, 0),
            include_overdue=True,
            limit=100,
        )
        task_ids = {task["id"] for task in tasks}
        self.assertIn("task-overdue", task_ids)
        self.assertNotIn("task-future", task_ids)

        # 不带 include_overdue 维持原行为：逾期任务不出现
        tasks = task_dao.get_user_tasks(
            user_id=user_id,
            exclude_status="completed",
            start_date=datetime(2026, 4, 8, 0, 0, 0),
            end_date=datetime(2026, 4, 9, 0, 0, 0),
            limit=100,
        )
        self.assertNotIn("task-overdue", {task["id"] for task in tasks})

    def test_include_overdue_does_not_flood_completed_list(self):
        """已完成查询不受 include_overdue 影响：仅按 completed_at 落界匹配"""
        user_id = "user-5"

        overdue_completed = Task(
            id="task-completed-long-ago",
            title="Completed long ago",
            user_id=user_id,
            due_date=datetime(2026, 4, 7, 20, 0, 0),
            content='',
        )
        overdue_completed.status = "completed"
        overdue_completed.completed_at = datetime(2026, 4, 7, 21, 0, 0)
        task_dao.create_task(overdue_completed)

        today_completed = Task(
            id="task-completed-in-range",
            title="Completed in range",
            user_id=user_id,
            due_date=datetime(2026, 4, 8, 12, 0, 0),
            content='',
        )
        today_completed.status = "completed"
        today_completed.completed_at = datetime(2026, 4, 8, 15, 0, 0)
        task_dao.create_task(today_completed)

        tasks = task_dao.get_user_tasks(
            user_id=user_id,
            status="completed",
            start_date=datetime(2026, 4, 8, 0, 0, 0),
            end_date=datetime(2026, 4, 9, 0, 0, 0),
            include_overdue=True,
            limit=100,
        )
        task_ids = {task["id"] for task in tasks}
        self.assertIn("task-completed-in-range", task_ids)
        self.assertNotIn("task-completed-long-ago", task_ids)

        count = task_dao.count_user_tasks(
            user_id=user_id,
            status="completed",
            start_date=datetime(2026, 4, 8, 0, 0, 0),
            end_date=datetime(2026, 4, 9, 0, 0, 0),
            include_overdue=True,
        )
        self.assertEqual(count, 1)


if __name__ == "__main__":
    unittest.main()
