# -*- coding: utf-8 -*-

import requests
import json
import logging

logger = logging.getLogger(__name__)


class PushService:
    def send(self, user_id: str, title: str, content: str):
        """发送推送到用户所有启用的渠道"""
        from database.dao.settings_dao import settings_dao
        settings = settings_dao.get_settings(user_id)
        
        if not settings.get('push_enabled', False):
            return
        
        channels_str = settings.get('push_channels', '[]')
        try:
            channels = json.loads(channels_str) if isinstance(channels_str, str) else channels_str
        except:
            return
        
        for channel in channels:
            if not channel.get('enabled', False):
                continue
            try:
                channel_type = channel.get('type')
                config = channel.get('config', {})
                if channel_type == 'bark':
                    self._send_bark(config, title, content)
                elif channel_type == 'custom_http':
                    self._send_custom_http(config, title, content)
            except Exception as e:
                logger.error(f"Push failed for channel {channel.get('name')}: {e}")
    
    def _send_bark(self, config: dict, title: str, content: str):
        """Bark 推送: POST {server_url} with JSON body"""
        server_url = config.get('server_url', 'https://api.day.app/push')
        device_key = config.get('device_key', '')
        if not device_key:
            raise ValueError("Bark device_key is required")
        
        payload = {
            "device_key": device_key,
            "title": title,
            "body": content,
        }
        if config.get('sound'):
            payload['sound'] = config['sound']
        if config.get('group'):
            payload['group'] = config['group']
        
        resp = requests.post(
            server_url,
            json=payload,
            headers={"Content-Type": "application/json; charset=utf-8"},
            timeout=10
        )
        resp.raise_for_status()
        return resp.json()
    
    def _send_custom_http(self, config: dict, title: str, content: str):
        """自定义 HTTP 推送"""
        url = config.get('url', '')
        if not url:
            raise ValueError("HTTP URL is required")
        
        method = config.get('method', 'POST').upper()
        headers = config.get('headers', {})
        body_template = config.get('body_template', '')
        
        # 替换占位符
        body = body_template.replace('{{title}}', title).replace('{{content}}', content)
        
        resp = requests.request(
            method=method,
            url=url,
            headers=headers,
            data=body.encode('utf-8'),
            timeout=10
        )
        resp.raise_for_status()
        return resp.text
    
    def test_channel(self, channel_config: dict) -> dict:
        """测试单个渠道"""
        try:
            channel_type = channel_config.get('type')
            config = channel_config.get('config', {})
            title = "TickList 推送测试"
            content = "如果您收到这条消息，说明推送渠道配置成功！"
            
            if channel_type == 'bark':
                self._send_bark(config, title, content)
            elif channel_type == 'custom_http':
                self._send_custom_http(config, title, content)
            else:
                return {"success": False, "message": f"未知渠道类型: {channel_type}"}
            
            return {"success": True, "message": "推送成功"}
        except Exception as e:
            return {"success": False, "message": str(e)}


push_service = PushService()
