import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Input, Button, Tag, Typography, Drawer, Tooltip } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined, LoadingOutlined, PlusOutlined, CloseOutlined } from '@ant-design/icons';
import { sendAiChatStream, StreamEvent } from '../api/ai';
import { useAiContext } from '../contexts/AiContext';
import { ToolAction } from '../types';
import './AiChatPanel.less';

const { Text } = Typography;

const TOOL_LABEL_MAP: Record<string, string> = {
  create_task: '创建任务', update_task: '更新任务', delete_task: '删除任务', list_tasks: '查询任务',
  create_note: '创建笔记', update_note: '更新笔记', delete_note: '删除笔记', list_notes: '查询笔记',
  create_countdown: '创建倒数日', update_countdown: '更新倒数日', delete_countdown: '删除倒数日', list_countdowns: '查询倒数日',
  create_counter: '创建计数器', update_counter: '操作计数器', delete_counter: '删除计数器', list_counters: '查询计数器',
  create_list: '创建清单', update_list: '更新清单', delete_list: '删除清单', list_lists: '查询清单',
  create_tag: '创建标签', update_tag: '更新标签', delete_tag: '删除标签', list_tags: '查询标签',
};

const AiChatPanel: React.FC = () => {
  const { messages, setMessages, conversationId, setConversationId, loading, setLoading, panelVisible, closePanel, newConversation } = useAiContext();
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isMobile = window.innerWidth <= 768;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text || loading) return;

    const userMsg = { role: 'user' as const, content: text };
    setMessages(prev => [...prev, userMsg]);
    setInputValue('');
    setLoading(true);

    let assistantContent = '';
    let assistantActions: ToolAction[] = [];

    setMessages(prev => [...prev, { role: 'assistant', content: '', actions: [] }]);

    const updateAssistant = () => {
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: assistantContent, actions: assistantActions };
        return updated;
      });
    };

    try {
      await sendAiChatStream(text, conversationId, (event: StreamEvent) => {
        switch (event.type) {
          case 'conversation_id':
            if (event.conversation_id) setConversationId(event.conversation_id);
            break;
          case 'text_delta':
            assistantContent += event.content || '';
            updateAssistant();
            break;
          case 'action':
            if (event.action) {
              assistantActions = [...assistantActions, event.action];
              updateAssistant();
            }
            break;
          case 'error':
            assistantContent = event.content || '请求失败，请稍后重试。';
            updateAssistant();
            break;
          case 'done':
            if (!assistantContent && assistantActions.length === 0) {
              assistantContent = '请求失败，请稍后重试。';
            }
            updateAssistant();
            break;
        }
      });
    } catch {
      if (!assistantContent) {
        assistantContent = '请求失败，请稍后重试。';
        updateAssistant();
      }
    } finally {
      setLoading(false);
    }
  }, [inputValue, loading, conversationId, setMessages, setConversationId, setLoading]);

  const renderAction = (action: ToolAction, idx: number) => {
    const label = TOOL_LABEL_MAP[action.tool] || action.tool;
    const isDelete = action.tool.startsWith('delete_');
    const isError = action.result.includes('"error"');
    return (
      <div className="action-card" key={idx}>
        <Tag color={isDelete ? 'red' : isError ? 'orange' : 'blue'}>{label}</Tag>
        <Text className="action-result">{isError ? '操作失败' : '已完成'}</Text>
      </div>
    );
  };

  const chatContent = (
    <div className="ai-chat-panel">
      <div className="ai-chat-header">
        <RobotOutlined style={{ fontSize: 18, marginRight: 8 }} />
        <Text strong style={{ fontSize: 15 }}>AI 助手</Text>
        <Tooltip title="新对话">
          <Button type="text" icon={<PlusOutlined />} size="small" onClick={newConversation} style={{ marginLeft: 8 }} />
        </Tooltip>
        <Button type="text" icon={<CloseOutlined />} size="small" onClick={closePanel} style={{ marginLeft: 'auto' }} />
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
              {msg.role === 'assistant' && !msg.content && loading && <LoadingOutlined />}
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
          placeholder="输入消息..."
          disabled={loading}
          className="ai-input"
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={handleSend}
          loading={loading}
          className="ai-send-btn"
        />
      </div>
    </div>
  );

  // Mobile: Drawer, Desktop: fixed floating panel
  if (isMobile) {
    return (
      <Drawer
        open={panelVisible}
        onClose={closePanel}
        placement="bottom"
        height="85vh"
        className="ai-chat-drawer"
        styles={{ body: { padding: 0 } }}
        destroyOnClose={false}
      >
        {chatContent}
      </Drawer>
    );
  }

  if (!panelVisible) return null;

  return (
    <div className="ai-chat-floating">
      {chatContent}
    </div>
  );
};

export default AiChatPanel;