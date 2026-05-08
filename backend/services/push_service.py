# -*- coding: utf-8 -*-

import requests
import json
import logging

logger = logging.getLogger(__name__)


class PushService:
    def send(self, user_id: str, title: str, content: str):
        """发送推送到用户所有启用的渠道"""
        from database.dao.settings_dao import settings_dao
        logger.info(f"[Push] send begin: user_id={user_id}, title={title!r}")
        settings = settings_dao.get_settings(user_id)

        if not settings.get('push_enabled', False):
            logger.info(f"[Push] push_enabled=False, skip. user_id={user_id}")
            return

        channels_str = settings.get('push_channels', '[]')
        try:
            channels = json.loads(channels_str) if isinstance(channels_str, str) else channels_str
        except Exception as e:
            logger.error(f"[Push] parse push_channels failed: {e}, raw={channels_str!r}")
            return

        logger.info(f"[Push] total channels={len(channels)}, user_id={user_id}")
        for channel in channels:
            channel_name = channel.get('name', '<unnamed>')
            if not channel.get('enabled', False):
                logger.debug(f"[Push] channel disabled, skip: {channel_name}")
                continue
            try:
                channel_type = channel.get('type')
                config = channel.get('config', {})
                logger.info(f"[Push] sending via channel: name={channel_name}, type={channel_type}")
                if channel_type == 'bark':
                    self._send_bark(config, title, content)
                elif channel_type == 'custom_http':
                    self._send_custom_http(config, title, content)
                else:
                    logger.warning(f"[Push] unknown channel type: {channel_type}, name={channel_name}")
                    continue
                logger.info(f"[Push] channel sent ok: name={channel_name}")
            except Exception as e:
                logger.error(f"[Push] channel send failed: name={channel_name}, type={channel.get('type')}, error={e}", exc_info=True)
    
    def _send_bark(self, config: dict, title: str, content: str):
        """Bark 推送: POST {server_url}/{device_key} with JSON body

        URL 智能拼接，兼容三种填写方式：
        1. 仅基址：https://api.day.app  → 自动拼成 https://api.day.app/{device_key}
        2. 完整 push 地址：https://api.day.app/push  → 原样使用，device_key 放 body
        3. 已含 device_key：https://api.day.app/xxxxx  → 原样使用
        """
        server_url = (config.get('server_url') or 'https://api.day.app').rstrip('/')
        device_key = config.get('device_key', '')
        if not device_key:
            logger.error("[Bark] device_key is required but missing")
            raise ValueError("Bark device_key is required")

        # 判断 URL 是否已包含 endpoint，避免重复拼接
        last_segment = server_url.rsplit('/', 1)[-1] if '/' in server_url.split('://', 1)[-1] else ''
        already_has_endpoint = last_segment in ('push',) or last_segment == device_key

        target_url = server_url if already_has_endpoint else f"{server_url}/{device_key}"

        # device_key 脱敏：只展示首尾 4 位，避免日志泄露
        masked_key = f"{device_key[:4]}***{device_key[-4:]}" if len(device_key) > 8 else "***"
        logger.info(
            f"[Bark] prepare request: server_url={server_url}, device_key={masked_key}, "
            f"already_has_endpoint={already_has_endpoint}, target_url={target_url}"
        )

        payload = {
            "device_key": device_key,
            "title": title,
            "body": content,
        }
        if config.get('sound'):
            payload['sound'] = config['sound']
        if config.get('group'):
            payload['group'] = config['group']

        # 日志中的 payload 同样脱敏 device_key
        log_payload = {**payload, 'device_key': masked_key}
        logger.debug(f"[Bark] payload={log_payload}")

        try:
            resp = requests.post(
                target_url,
                json=payload,
                headers={"Content-Type": "application/json; charset=utf-8"},
                timeout=10
            )
        except requests.RequestException as e:
            logger.error(f"[Bark] network error: target_url={target_url}, error={e}")
            raise

        # 记录响应（不论是否成功），便于排查
        body_preview = resp.text[:500] if resp.text else ''
        logger.info(f"[Bark] response: status={resp.status_code}, body_preview={body_preview!r}")

        if not resp.ok:
            logger.error(f"[Bark] HTTP error: status={resp.status_code}, target_url={target_url}, body={body_preview!r}")
        resp.raise_for_status()

        try:
            return resp.json()
        except ValueError:
            logger.warning(f"[Bark] response is not JSON, return raw text. body_preview={body_preview!r}")
            return {"raw": resp.text}
    
    def _send_custom_http(self, config: dict, title: str, content: str):
        """自定义 HTTP 推送"""
        url = config.get('url', '')
        if not url:
            logger.error("[CustomHTTP] url is required but missing")
            raise ValueError("HTTP URL is required")

        method = config.get('method', 'POST').upper()
        headers = config.get('headers', {})
        body_template = config.get('body_template', '')

        # 替换占位符
        body = body_template.replace('{{title}}', title).replace('{{content}}', content)

        # 敏感请求头脱敏（Authorization、Cookie、token 等）
        sensitive_keys = {'authorization', 'cookie', 'x-api-key', 'token', 'x-token'}
        log_headers = {
            k: ('***' if k.lower() in sensitive_keys else v) for k, v in headers.items()
        }
        body_preview = body[:500] if body else ''
        logger.info(
            f"[CustomHTTP] prepare request: method={method}, url={url}, "
            f"headers={log_headers}, body_preview={body_preview!r}"
        )

        try:
            resp = requests.request(
                method=method,
                url=url,
                headers=headers,
                data=body.encode('utf-8'),
                timeout=10
            )
        except requests.RequestException as e:
            logger.error(f"[CustomHTTP] network error: url={url}, error={e}")
            raise

        resp_preview = resp.text[:500] if resp.text else ''
        logger.info(f"[CustomHTTP] response: status={resp.status_code}, body_preview={resp_preview!r}")

        if not resp.ok:
            logger.error(f"[CustomHTTP] HTTP error: status={resp.status_code}, url={url}, body={resp_preview!r}")
        resp.raise_for_status()
        return resp.text
    
    def test_channel(self, channel_config: dict) -> dict:
        """测试单个渠道"""
        channel_type = channel_config.get('type')
        logger.info(f"[Push.test] begin test: type={channel_type}")
        try:
            config = channel_config.get('config', {})
            title = "TickList 推送测试"
            content = "如果您收到这条消息，说明推送渠道配置成功！"

            if channel_type == 'bark':
                self._send_bark(config, title, content)
            elif channel_type == 'custom_http':
                self._send_custom_http(config, title, content)
            else:
                logger.warning(f"[Push.test] unknown channel type: {channel_type}")
                return {"success": False, "message": f"未知渠道类型: {channel_type}"}

            logger.info(f"[Push.test] success: type={channel_type}")
            return {"success": True, "message": "推送成功"}
        except Exception as e:
            logger.error(f"[Push.test] failed: type={channel_type}, error={e}", exc_info=True)
            return {"success": False, "message": str(e)}


push_service = PushService()
