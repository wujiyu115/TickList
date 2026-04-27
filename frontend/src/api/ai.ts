import { AiChatResponse, ToolAction } from '../types';

export interface StreamEvent {
  type: 'conversation_id' | 'text_start' | 'text_delta' | 'tool_start' | 'action' | 'error' | 'done';
  content?: string;
  conversation_id?: string;
  tool?: string;
  action?: ToolAction;
}

export const sendAiChatStream = async (
  message: string,
  conversationId?: string,
  onEvent: (event: StreamEvent) => void,
): Promise<void> => {
  const token = localStorage.getItem('token');
  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message, conversation_id: conversationId }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      onEvent({ type: 'error', content: '消息频率超限，请稍后重试' });
    } else {
      onEvent({ type: 'error', content: '请求失败，请稍后重试' });
    }
    onEvent({ type: 'done' });
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    onEvent({ type: 'error', content: '无法读取响应' });
    onEvent({ type: 'done' });
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event: StreamEvent = JSON.parse(line.slice(6));
          onEvent(event);
        } catch {
          // skip malformed events
        }
      }
    }
  }
};