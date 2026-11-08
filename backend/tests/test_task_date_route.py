from datetime import datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from database.dao.task_dao import task_dao
from middleware.jwt_middleware import get_current_user
from models import Task
from routes.task import router


@pytest.fixture
def task_client():
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: "date-test-user"
    with TestClient(app) as client:
        yield client


def add_task(task_id, *, due=None, start=None, completed=None):
    task = Task(
        id=task_id,
        title=task_id,
        user_id="date-test-user",
        status="completed" if completed else "pending",
        due_date=datetime.fromisoformat(due) if due else None,
        start_time=datetime.fromisoformat(start) if start else None,
    )
    if completed:
        task.completed_at = datetime.fromisoformat(completed)
    task_dao.create_task(task)


def get_ids(client, end, **params):
    response = client.get("/api/tasks", params={
        "start_date": "2026-04-07T16:00:00Z",  # April 8 midnight in UTC+8
        "end_date": end,
        **params,
    })
    assert response.status_code == 200
    data = response.json()
    ids = {task["id"] for task in data["tasks"]}
    assert data["total"] == len(ids)
    return ids


def test_today_excludes_tomorrow_and_includes_overdue(task_client):
    add_task("overdue", due="2026-04-07T15:59:59+00:00")
    add_task("today", due="2026-04-08T15:59:59+00:00")
    add_task("tomorrow", due="2026-04-08T16:00:00+00:00")
    add_task("start-tomorrow", start="2026-04-08T16:00:00+00:00")

    assert get_ids(task_client, "2026-04-08T16:00:00Z", exclude_status="completed", include_overdue="true") == {"overdue", "today"}
    assert get_ids(task_client, "2026-04-08T16:00:00Z", exclude_status="completed") == {"today"}


def test_week_excludes_eighth_day(task_client):
    add_task("seventh", due="2026-04-14T15:59:59+00:00")
    add_task("eighth", due="2026-04-14T16:00:00+00:00")

    assert get_ids(task_client, "2026-04-14T16:00:00Z") == {"seventh"}


def test_completed_boundary_and_date_branches_are_or(task_client):
    add_task("completed-inside", completed="2026-04-08T15:59:59+00:00")
    add_task("completed-at-end", completed="2026-04-08T16:00:00+00:00")
    add_task("due-inside", due="2026-04-08T12:00:00+00:00", completed="2026-04-08T16:00:00+00:00")
    add_task("completed-inside-due-outside", due="2026-04-09T12:00:00+00:00", completed="2026-04-08T12:00:00+00:00")

    assert get_ids(task_client, "2026-04-08T16:00:00Z", status="completed", include_overdue="true") == {
        "completed-inside", "due-inside", "completed-inside-due-outside",
    }
