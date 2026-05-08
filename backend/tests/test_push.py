# -*- coding: utf-8 -*-
"""推送服务模块测试

覆盖:
  - PushService 单元测试（Bark / Custom HTTP）
  - /api/settings/push/test API 端点
  - SchedulerService 到期通知调度
"""

import json
import uuid
from datetime import date, datetime, timedelta
from unittest.mock import patch, MagicMock

import pytest
import requests as real_requests

from services.push_service import PushService, push_service
from services.scheduler_service import SchedulerService
from database.models import TaskModel


# ==========================================================================
# Helper: 构造 Mock Response
# ==========================================================================

def _mock_bark_response(status_code=200):
    """构造 Bark API 成功响应的 Mock"""
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = {
        "code": 200,
        "message": "success",
        "timestamp": 1713340800,
    }
    resp.raise_for_status = MagicMock()
    return resp


def _mock_text_response(text="OK", status_code=200):
    """构造普通文本响应的 Mock"""
    resp = MagicMock()
    resp.status_code = status_code
    resp.text = text
    resp.raise_for_status = MagicMock()
    return resp


# ==========================================================================
# 1. PushService 单元测试
# ==========================================================================

class TestSendBark:
    """Bark 推送单元测试"""

    @patch("services.push_service.requests.post")
    def test_send_bark_success(self, mock_post):
        """Bark 推送成功发送，验证请求参数"""
        mock_post.return_value = _mock_bark_response()

        svc = PushService()
        config = {"device_key": "test_key_123", "sound": "bell", "group": "TickList"}
        result = svc._send_bark(config, "测试标题", "测试内容")

        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args
        # 验证 URL 为默认值
        assert call_kwargs[0][0] == "https://api.day.app/push"
        # 验证 JSON payload
        payload = call_kwargs[1]["json"]
        assert payload["device_key"] == "test_key_123"
        assert payload["title"] == "测试标题"
        assert payload["body"] == "测试内容"
        assert payload["sound"] == "bell"
        assert payload["group"] == "TickList"
        # 验证 timeout
        assert call_kwargs[1]["timeout"] == 10
        # 验证返回值
        assert result["code"] == 200

    @patch("services.push_service.requests.post")
    def test_send_bark_with_custom_server(self, mock_post):
        """自定义 server_url 的情况"""
        mock_post.return_value = _mock_bark_response()

        svc = PushService()
        config = {
            "device_key": "my_key",
            "server_url": "https://my-bark.example.com/push",
        }
        svc._send_bark(config, "Title", "Body")

        call_args = mock_post.call_args
        assert call_args[0][0] == "https://my-bark.example.com/push"

    def test_send_bark_missing_device_key(self):
        """device_key 缺失时抛出 ValueError"""
        svc = PushService()
        with pytest.raises(ValueError, match="device_key"):
            svc._send_bark({}, "Title", "Body")

    @patch("services.push_service.requests.post")
    def test_send_bark_network_error(self, mock_post):
        """网络异常时抛出 ConnectionError"""
        mock_post.side_effect = real_requests.ConnectionError("Network unreachable")

        svc = PushService()
        config = {"device_key": "test_key"}
        with pytest.raises(real_requests.ConnectionError):
            svc._send_bark(config, "Title", "Body")

    @patch("services.push_service.requests.post")
    def test_send_bark_without_optional_fields(self, mock_post):
        """不传 sound/group 时 payload 中不应包含"""
        mock_post.return_value = _mock_bark_response()

        svc = PushService()
        config = {"device_key": "key_only"}
        svc._send_bark(config, "T", "C")

        payload = mock_post.call_args[1]["json"]
        assert "sound" not in payload
        assert "group" not in payload


class TestSendCustomHttp:
    """自定义 HTTP 推送单元测试"""

    @patch("services.push_service.requests.request")
    def test_send_custom_http_success(self, mock_request):
        """自定义 HTTP 推送成功"""
        mock_request.return_value = _mock_text_response("OK")

        svc = PushService()
        config = {
            "url": "https://webhook.example.com/notify",
            "method": "POST",
            "headers": {"X-Token": "abc"},
            "body_template": '{"msg": "hello"}',
        }
        result = svc._send_custom_http(config, "Title", "Body")

        mock_request.assert_called_once()
        call_kwargs = mock_request.call_args[1]
        assert call_kwargs["method"] == "POST"
        assert call_kwargs["url"] == "https://webhook.example.com/notify"
        assert call_kwargs["headers"]["X-Token"] == "abc"
        assert call_kwargs["timeout"] == 10
        assert result == "OK"

    @patch("services.push_service.requests.request")
    def test_send_custom_http_template_replace(self, mock_request):
        """验证 title 和 content 模板替换"""
        mock_request.return_value = _mock_text_response()

        svc = PushService()
        config = {
            "url": "https://hook.example.com",
            "method": "POST",
            "headers": {},
            "body_template": '{"title":"{{title}}","content":"{{content}}"}',
        }
        svc._send_custom_http(config, "我的标题", "我的内容")

        sent_body = mock_request.call_args[1]["data"]
        body_str = sent_body.decode("utf-8") if isinstance(sent_body, bytes) else sent_body
        assert "我的标题" in body_str
        assert "我的内容" in body_str
        assert "{{title}}" not in body_str
        assert "{{content}}" not in body_str

    def test_send_custom_http_missing_url(self):
        """url 缺失时抛出 ValueError"""
        svc = PushService()
        with pytest.raises(ValueError, match="URL"):
            svc._send_custom_http({}, "T", "C")


class TestPushServiceSend:
    """PushService.send 综合测试"""

    @patch("services.push_service.requests.post")
    def test_send_with_push_disabled(self, mock_post):
        """push_enabled=False 时不应发送推送"""
        with patch("database.dao.settings_dao.settings_dao.get_settings") as mock_settings:
            mock_settings.return_value = {"push_enabled": False, "push_channels": "[]"}

            svc = PushService()
            svc.send("user_1", "Title", "Body")

            mock_post.assert_not_called()

    @patch("services.push_service.requests.post")
    def test_send_multiple_channels(self, mock_post):
        """多渠道发送测试：只有 enabled 的渠道才发送"""
        mock_post.return_value = _mock_bark_response()

        channels = [
            {"type": "bark", "name": "Bark1", "enabled": True,
             "config": {"device_key": "key1"}},
            {"type": "bark", "name": "Bark2", "enabled": False,
             "config": {"device_key": "key2"}},
            {"type": "bark", "name": "Bark3", "enabled": True,
             "config": {"device_key": "key3"}},
        ]
        with patch("database.dao.settings_dao.settings_dao.get_settings") as mock_settings:
            mock_settings.return_value = {
                "push_enabled": True,
                "push_channels": json.dumps(channels),
            }

            svc = PushService()
            svc.send("user_1", "Title", "Body")

            # 只有 enabled=True 的 2 个渠道调用了 requests.post
            assert mock_post.call_count == 2


class TestTestChannel:
    """test_channel 方法测试"""

    @patch("services.push_service.requests.post")
    def test_test_channel_bark(self, mock_post):
        """测试 Bark 渠道"""
        mock_post.return_value = _mock_bark_response()

        svc = PushService()
        result = svc.test_channel({
            "type": "bark",
            "config": {"device_key": "test_key"},
        })

        assert result["success"] is True
        assert "成功" in result["message"]
        mock_post.assert_called_once()

    def test_test_channel_unknown_type(self):
        """未知渠道类型"""
        svc = PushService()
        result = svc.test_channel({"type": "sms", "config": {}})
        assert result["success"] is False
        assert "未知" in result["message"]

    @patch("services.push_service.requests.post")
    def test_test_channel_bark_error(self, mock_post):
        """Bark 推送失败返回错误信息"""
        mock_post.side_effect = real_requests.ConnectionError("timeout")

        svc = PushService()
        result = svc.test_channel({
            "type": "bark",
            "config": {"device_key": "bad_key"},
        })
        assert result["success"] is False
        assert result["message"]  # 包含错误信息


# ==========================================================================
# 2. API 端点测试
# ==========================================================================

class TestPushTestEndpoint:
    """POST /api/settings/push/test 端点测试"""

    @patch("services.push_service.requests.post")
    def test_push_test_endpoint(self, mock_post, app_client, auth_headers):
        """正常 Bark 测试请求"""
        mock_post.return_value = _mock_bark_response()

        resp = app_client.post(
            "/api/settings/push/test",
            json={"type": "bark", "config": {"device_key": "my_device"}},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True

    def test_push_test_endpoint_invalid_config(self, app_client, auth_headers):
        """缺少 device_key 时应返回错误"""
        resp = app_client.post(
            "/api/settings/push/test",
            json={"type": "bark", "config": {}},
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is False
        assert data["message"]  # 包含错误描述


# ==========================================================================
# 3. SchedulerService 测试
# ==========================================================================

class TestSchedulerCollectTaskDue:
    """SchedulerService._collect_task_due 测试（精度：分钟级）"""

    def _make_task(self, db_session, user_id, **overrides):
        """辅助：创建一条任务并写入 DB

        默认 due_date 为"1 分钟前的当天时间"，确保已经到点会被收集。
        """
        default_due = (datetime.now().replace(microsecond=0, second=0)
                       - timedelta(minutes=1)).isoformat()
        task = TaskModel(
            id=str(uuid.uuid4()),
            title=overrides.get("title", "Test Task"),
            status=overrides.get("status", "pending"),
            user_id=user_id,
            due_date=overrides.get("due_date", default_due),
            push_due_notify=overrides.get("push_due_notify", True),
            push_notified_date=overrides.get("push_notified_date", None),
            deleted_at=overrides.get("deleted_at", None),
            created_at=datetime.now().isoformat(),
            updated_at=datetime.now().isoformat(),
        )
        db_session.add(task)
        db_session.commit()
        return task

    def test_collect_task_due(self, db_session, test_user):
        """已到期任务（分钟级）应被收集，消息含到期分钟标记"""
        self._make_task(db_session, test_user.id, title="Due Now")

        svc = SchedulerService()
        messages, records = svc._collect_task_due(db_session)

        assert test_user.id in messages
        assert len(messages[test_user.id]) == 1
        text, marker = messages[test_user.id][0]
        assert "Due Now" in text
        # marker 形如 "YYYY-MM-DDTHH:MM"
        assert len(marker) == 16 and marker[10] == "T"
        assert len(records) == 1
        record_task, record_marker = records[0]
        assert record_marker == marker

    def test_collect_task_due_not_yet_reached(self, db_session, test_user):
        """未到点的任务（同一天但时间在未来）不应被收集"""
        future_due = (datetime.now().replace(microsecond=0, second=0)
                      + timedelta(minutes=10)).isoformat()
        self._make_task(
            db_session, test_user.id,
            title="Future Today",
            due_date=future_due,
        )

        svc = SchedulerService()
        messages, records = svc._collect_task_due(db_session)

        assert messages.get(test_user.id, []) == []
        assert records == []

    def test_collect_task_due_already_notified(self, db_session, test_user):
        """已通知的任务（push_notified_date == 该到期时间标记）不重复收集"""
        due_dt = datetime.now().replace(microsecond=0, second=0) - timedelta(minutes=2)
        marker = due_dt.strftime('%Y-%m-%dT%H:%M')
        self._make_task(
            db_session, test_user.id,
            title="Already Notified",
            due_date=due_dt.isoformat(),
            push_notified_date=marker,
        )

        svc = SchedulerService()
        messages, records = svc._collect_task_due(db_session)

        assert messages.get(test_user.id, []) == []

    def test_collect_task_due_with_timezone_iso(self, db_session, test_user):
        """带时区的 ISO 字符串（如 2026-05-08T10:58:00+00:00）应被正确解析"""
        # 构造一个"已到期 2 分钟"的本地时间，再附加本地时区偏移
        local_dt = datetime.now().astimezone().replace(microsecond=0, second=0) - timedelta(minutes=2)
        self._make_task(
            db_session, test_user.id,
            title="TZ Task",
            due_date=local_dt.isoformat(),  # 带 +08:00 之类
        )

        svc = SchedulerService()
        messages, records = svc._collect_task_due(db_session)

        assert test_user.id in messages
        assert any("TZ Task" in text for text, _ in messages[test_user.id])

    def test_collect_task_due_completed_excluded(self, db_session, test_user):
        """已完成任务被排除"""
        self._make_task(
            db_session, test_user.id,
            title="Completed Task",
            status="completed",
        )

        svc = SchedulerService()
        messages, records = svc._collect_task_due(db_session)

        assert messages.get(test_user.id, []) == []

    def test_collect_task_due_deleted_excluded(self, db_session, test_user):
        """软删除的任务被排除"""
        self._make_task(
            db_session, test_user.id,
            title="Deleted Task",
            deleted_at=datetime.now().isoformat(),
        )

        svc = SchedulerService()
        messages, records = svc._collect_task_due(db_session)

        assert messages.get(test_user.id, []) == []

    def test_collect_task_due_notify_disabled(self, db_session, test_user):
        """push_due_notify=False 的任务被排除"""
        self._make_task(
            db_session, test_user.id,
            title="No Notify",
            push_due_notify=False,
        )

        svc = SchedulerService()
        messages, records = svc._collect_task_due(db_session)

        assert messages.get(test_user.id, []) == []


class TestCheckDueNotificationsFlow:
    """check_due_notifications 完整流程测试"""

    @patch("services.push_service.push_service.send")
    def test_check_due_notifications_flow(self, mock_send, db_session, test_user):
        """Mock push_service.send，验证完整调度流程：
        - 已到点的分钟级任务会触发推送
        - 推送后 push_notified_date 被设置为该到期时间分钟标记
        """
        due_dt = datetime.now().replace(microsecond=0, second=0) - timedelta(minutes=1)
        task = TaskModel(
            id=str(uuid.uuid4()),
            title="Flow Test Task",
            status="pending",
            user_id=test_user.id,
            due_date=due_dt.isoformat(),
            push_due_notify=True,
            push_notified_date=None,
            deleted_at=None,
            created_at=datetime.now().isoformat(),
            updated_at=datetime.now().isoformat(),
        )
        db_session.add(task)
        db_session.commit()
        task_id = task.id

        svc = SchedulerService()
        svc.check_due_notifications()

        # push_service.send 应该被调用
        mock_send.assert_called()
        call_kwargs = mock_send.call_args
        assert call_kwargs[1]["user_id"] == test_user.id or call_kwargs[0][0] == test_user.id

        # 校验已通知标记被写入（精度到分钟）
        db_session.expire_all()
        refreshed = db_session.query(TaskModel).filter(TaskModel.id == task_id).first()
        assert refreshed.push_notified_date == due_dt.strftime('%Y-%m-%dT%H:%M')
