import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Input, Button, Tag, Typography } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined, LoadingOutlined } from '@ant-design/icons';
import { sendAiChatStream, StreamEvent } from '../api/ai';
import { AiChatMessage, ToolAction } from '../types';
import './AiPage.less';

const { Text } = Typography;

const AiPage: React.FC = () => {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || loading) return;

    const userMsg: AiChatMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setLoading(true);

    // Create placeholder assistant message for streaming
    let assistantContent = '';
    let assistantActions: ToolAction[] = [];

    setMessages(prev => [...prev, { role: 'assistant', content: '', actions: [] }]);

    const updateAssistant = () => {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: assistantContent,
          actions: assistantActions,
        };
        return updated;
      });
    };

    try {
      await sendAiChatStream(text, conversationId, (event: StreamEvent) => {
        console.debug('[AI][page] handle event', event.type, event);
        switch (event.type) {
          case 'conversation_id':
            if (event.conversation_id) {
              console.info('[AI][page] conversation_id', event.conversation_id);
              setConversationId(event.conversation_id);
            }
            break;
          // legacy 流式增量
          case 'text_delta':
            assistantContent += event.content || '';
            updateAssistant();
            break;
          // pipeline / chitchat 一次性文本
          case 'text':
            assistantContent += event.content || '';
            updateAssistant();
            break;
          // legacy tool 执行 action
          case 'action':
            if (event.action) {
              assistantActions = [...assistantActions, event.action];
              updateAssistant();
            }
            break;
          // pipeline executor 执行结果。result 在后端是 dict，统一 JSON 序列化，
          // 以保证 renderAction 中 `result.includes('"error"')` 能正确识别错误。
          case 'tool_result':
            if (event.tool) {
              const action: ToolAction = {
                tool: event.tool,
                params: {},
                result: JSON.stringify(event.result ?? {}),
              };
              assistantActions = [...assistantActions, action];
              updateAssistant();
            }
            break;
          // pipeline 多匹配：当前前端未对接 /ai/disambiguate 二次交互接口，
          // 先以文案提示用户重新精确表述，避免静默失败。后续接入后再扩展。
          case 'disambiguation':
            assistantContent += (event.reply || '匹配到多个结果，请重新描述具体目标。') + '\n';
            updateAssistant();
            break;
          // pipeline 删除确认：当前前端未对接 /ai/confirm 二次交互接口，
          // 先以文案提示用户在界面手动操作，避免误删。后续接入后再扩展。
          case 'confirmation':
            assistantContent += (event.reply || '该操作需确认，请在对应页面手动执行。') + '\n';
            updateAssistant();
            break;
          case 'error':
            console.warn('[AI][page] error event', event.content);
            assistantContent = event.content || '请求失败，请稍后重试。';
            updateAssistant();
            break;
          case 'done':
            console.info('[AI][page] done', {
              assistantContentLen: assistantContent.length,
              actionsCount: assistantActions.length,
            });
            if (!assistantContent && assistantActions.length === 0) {
              assistantContent = '请求失败，请稍后重试。';
            }
            updateAssistant();
            break;
          default:
            console.warn('[AI][page] unknown event type', event.type, event);
        }
      });
    } catch (err) {
      console.error('[AI][page] sendAiChatStream throw', err);
      if (!assistantContent) {
        assistantContent = '请求失败，请稍后重试。';
        updateAssistant();
      }
    } finally {
      setLoading(false);
    }
  }, [inputValue, loading, conversationId]);

  const renderAction = (action: ToolAction, idx: number) => {
    const toolLabelMap: Record<string, string> = {
      create_task: '创建任务',
      update_task: '更新任务',
      delete_task: '删除任务',
      list_tasks: '查询任务',
      create_note: '创建笔记',
      update_note: '更新笔记',
      delete_note: '删除笔记',
      list_notes: '查询笔记',
      create_countdown: '创建倒数日',
      update_countdown: '更新倒数日',
      delete_countdown: '删除倒数日',
      list_countdowns: '查询倒数日',
      create_counter: '创建计数器',
      update_counter: '操作计数器',
      delete_counter: '删除计数器',
      list_counters: '查询计数器',
      create_list: '创建清单',
      update_list: '更新清单',
      delete_list: '删除清单',
      list_lists: '查询清单',
      create_tag: '创建标签',
      update_tag: '更新标签',
      delete_tag: '删除标签',
      list_tags: '查询标签',
    };
    const label = toolLabelMap[action.tool] || action.tool;
    const isDelete = action.tool.startsWith('delete_');
    const isError = action.result.includes('"error"');

    return (
      <div className="action-card" key={idx}>
        <Tag color={isDelete ? 'red' : isError ? 'orange' : 'blue'}>{label}</Tag>
        <Text className="action-result">{isError ? '操作失败' : '已完成'}</Text>
      </div>
    );
  };

  return (
    <div className="ai-page">
      <div className="ai-page-header">
        <RobotOutlined style={{ fontSize: 20, marginRight: 8 }} />
        <Text strong style={{ fontSize: 16 }}>AI 助手</Text>
      </div>

      <div className="ai-messages">
        {messages.map((msg, idx) => (
          <div className={`ai-message ai-message-${msg.role}`} key={idx}>
            <div className="ai-message-icon">
              {msg.role === 'user' ? <UserOutlined /> : <RobotOutlined />}
            </div>
            <div className="ai-message-content">
              <div className="ai-message-text">{msg.content}</div>
              {msg.actions && msg.actions.length > 0 && (
                <div className="ai-message-actions">
                  {msg.actions.map((a, i) => renderAction(a, i))}
                </div>
              )}
              {msg.role === 'assistant' && !msg.content && loading && (
                <LoadingOutlined />
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="ai-input-area">
        <Input
          value={inputValue}
          onChange={e => setInputValue(e.target.value)}
          onPressEnter={handleSend}
          placeholder="输入消息，如「帮我创建一个明天截止的任务：写周报」"
          size="large"
          disabled={loading}
          className="ai-input"
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          loading={loading}
          size="large"
          className="ai-send-btn"
        />
      </div>
    </div>
  );
};

export default AiPage;