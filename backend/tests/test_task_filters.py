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


if __name__ == "__main__":
    unittest.main()
