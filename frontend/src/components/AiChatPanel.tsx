import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Input, Button, Tag, Typography, Drawer, Tooltip, Space } from 'antd';
import { SendOutlined, RobotOutlined, UserOutlined, LoadingOutlined, PlusOutlined, CloseOutlined } from '@ant-design/icons';
import { sendAiChatStream, StreamEvent } from '../api/ai';
import { useAiContext } from '../contexts/AiContext';
import { ToolAction, AiChatMessage } from '../types';
import AiPendingUI from './AiPendingUI';
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

// 把列表项渲染成"标题"。task/note 用 title，list/tag/counter 用 name，countdown 用 title。
const renderListItemTitle = (tool: string, item: any): string => {
  return item?.title || item?.name || item?.id || '(未命名)';
};

// 渲染列表项的元信息（截止时间、状态等），返回小尺寸 Tag 数组。
const renderListItemMeta = (tool: string, item: any): React.ReactNode => {
  const tags: React.ReactNode[] = [];
  // 任务：状态 + 截止时间
  if (tool === 'list_tasks') {
    if (item.status === 'completed') {
      tags.push(<Tag key="s" color="green" style={{ marginLeft: 4 }}>已完成</Tag>);
    } else if (item.status === 'pending') {
      tags.push(<Tag key="s" color="blue" style={{ marginLeft: 4 }}>待办</Tag>);
    }
    if (item.due_date) {
      const d = new Date(item.due_date);
      const text = `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      tags.push(<Tag key="d" style={{ marginLeft: 4 }}>{text}</Tag>);
    }
  }
  // 倒数日：目标日期
  if (tool === 'list_countdowns' && item.target_date) {
    const d = new Date(item.target_date);
    tags.push(<Tag key="d" style={{ marginLeft: 4 }}>{`${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`}</Tag>);
  }
  // 计数器：当前值
  if (tool === 'list_counters' && typeof item.current_value === 'number') {
    tags.push(<Tag key="v" color="purple" style={{ marginLeft: 4 }}>{item.current_value}</Tag>);
  }
  return tags.length > 0 ? <span className="action-list-meta">{tags}</span> : null;
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
        console.debug('[AI][panel] handle event', event.type, event);
        switch (event.type) {
          case 'conversation_id':
            if (event.conversation_id) {
              console.info('[AI][panel] conversation_id', event.conversation_id);
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
          // pipeline 多匹配：存储 payload 供交互 UI 渲染
          case 'disambiguation':
            updateAssistant();
            setMessages(prev => {
              const updated = [...prev];
              const msg = updated[updated.length - 1];
              updated[updated.length - 1] = {
                ...msg,
                pendingDisambiguation: {
                  pending_intent: event.pending_intent || '',
                  candidates: event.candidates || [],
                  extra_params: event.extra_params || {},
                  reply: event.reply || '匹配到多个结果，请选择目标。',
                },
              };
              return updated;
            });
            break;
          // pipeline 删除确认：存储 payload 供交互 UI 渲染
          case 'confirmation':
            updateAssistant();
            setMessages(prev => {
              const updated = [...prev];
              const msg = updated[updated.length - 1];
              updated[updated.length - 1] = {
                ...msg,
                pendingConfirmation: {
                  pending_intent: event.pending_intent || '',
                  params: event.params || {},
                  target_description: event.target_description || '',
                  reply: event.reply || '该操作需确认。',
                },
              };
              return updated;
            });
            break;
          case 'error':
            console.warn('[AI][panel] error event', event.content);
            assistantContent = event.content || '请求失败，请稍后重试。';
            updateAssistant();
            break;
          case 'done':
            console.info('[AI][panel] done', {
              assistantContentLen: assistantContent.length,
              actionsCount: assistantActions.length,
            });
            if (!assistantContent && assistantActions.length === 0) {
              assistantContent = '请求失败，请稍后重试。';
            }
            updateAssistant();
            break;
          default:
            console.warn('[AI][panel] unknown event type', event.type, event);
        }
      });
    } catch (err) {
      console.error('[AI][panel] sendAiChatStream throw', err);
      if (!assistantContent) {
        assistantContent = '请求失败，请稍后重试。';
        updateAssistant();
      }
    } finally {
      setLoading(false);
    }
  }, [inputValue, loading, conversationId, setMessages, setConversationId, setLoading]);

  const handleMessageUpdate = useCallback((index: number, updated: AiChatMessage) => {
    setMessages(prev => {
      const copy = [...prev];
      copy[index] = updated;
      return copy;
    });
  }, [setMessages]);

  // result 是后端 JSON 序列化后的字符串，统一在此 parse + 抽取关键字段渲染。
  // 失败安全：parse 异常时回退到"已完成"摘要。
  const renderAction = (action: ToolAction, idx: number) => {
    const label = TOOL_LABEL_MAP[action.tool] || action.tool;
    const isDelete = action.tool.startsWith('delete_');
    const isList = action.tool.startsWith('list_');

    let parsed: any = null;
    try {
      parsed = action.result ? JSON.parse(action.result) : null;
    } catch {
      parsed = null;
    }
    const isError = parsed && typeof parsed === 'object' && 'error' in parsed;

    // 1) 错误场景：单独高亮
    if (isError) {
      return (
        <div className="action-card action-card-error" key={idx}>
          <Tag color="orange">{label}</Tag>
          <Text className="action-result">操作失败：{String(parsed.error)}</Text>
        </div>
      );
    }

    // 2) 查询类：展开列表项（任务/笔记/倒数日/计数器/清单/标签）
    if (isList && parsed && typeof parsed === 'object') {
      // 后端返回 { tasks: [...], count: n } / { notes: [...], count: n } 等
      const listKey = Object.keys(parsed).find(k => Array.isArray((parsed as any)[k]));
      const items: any[] = listKey ? (parsed as any)[listKey] : [];
      const count = parsed.count ?? items.length;

      return (
        <div className="action-card action-card-list" key={idx}>
          <div className="action-card-header">
            <Tag color="blue">{label}</Tag>
            <Text type="secondary">共 {count} 条</Text>
          </div>
          {items.length > 0 ? (
            <ul className="action-list">
              {items.slice(0, 20).map((item, i) => (
                <li key={item.id || i} className="action-list-item">
                  <Text>{renderListItemTitle(action.tool, item)}</Text>
                  {renderListItemMeta(action.tool, item)}
                </li>
              ))}
              {items.length > 20 && (
                <li className="action-list-item action-list-more">
                  <Text type="secondary">… 还有 {items.length - 20} 条未显示</Text>
                </li>
              )}
            </ul>
          ) : (
            <Text type="secondary" className="action-empty">没有匹配的结果</Text>
          )}
        </div>
      );
    }

    // 3) 创建/更新/删除：摘要展示
    let summary = '已完成';
    if (isDelete) {
      summary = '已删除';
    } else if (parsed && typeof parsed === 'object') {
      const title = parsed.title || parsed.name;
      if (title) summary = `「${title}」`;
    }
    return (
      <div className="action-card" key={idx}>
        <Tag color={isDelete ? 'red' : 'blue'}>{label}</Tag>
        <Text className="action-result">{summary}</Text>
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
              {(msg.pendingConfirmation || msg.pendingDisambiguation) && (
                <AiPendingUI
                  message={msg}
                  messageIndex={idx}
                  conversationId={conversationId}
                  onMessageUpdate={handleMessageUpdate}
                />
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