import { ToolAction } from '../types';

/**
 * SSE 事件类型，覆盖 legacy（text_delta/action 等）+ pipeline 三层新事件
 * 后端事件源：services/ai/pipeline/executor.py、claude_stream.py、openai_stream.py
 */
export interface StreamEvent {
  type:
    | 'conversation_id'
    | 'text_start'
    | 'text_delta'
    | 'text'              // pipeline executor / chitchat 一次性文本
    | 'tool_start'
    | 'tool_result'       // pipeline executor 执行 DAO 后的结果
    | 'action'            // legacy stream
    | 'disambiguation'    // pipeline 多匹配（待二次交互）
    | 'confirmation'      // pipeline 删除确认（待二次交互）
    | 'error'
    | 'done';
  content?: string;
  conversation_id?: string;
  tool?: string;
  action?: ToolAction;
  // tool_result 的 result：后端是 dict，前端按 any 接收
  result?: any;
  source?: string;
  // disambiguation 携带
  pending_intent?: string;
  candidates?: any[];
  extra_params?: Record<string, any>;
  // confirmation 携带
  params?: Record<string, any>;
  target_description?: string;
  reply?: string;
}

export const sendAiChatStream = async (
  message: string,
  conversationId?: string,
  onEvent: (event: StreamEvent) => void,
): Promise<void> => {
  const token = localStorage.getItem('token');
  const _t0 = performance.now();
  console.info('[AI][api] send', { message: message.slice(0, 60), conversationId });

  const response = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message, conversation_id: conversationId }),
  });

  console.info('[AI][api] response', { status: response.status, ok: response.ok });

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
    console.warn('[AI][api] response.body is null');
    onEvent({ type: 'error', content: '无法读取响应' });
    onEvent({ type: 'done' });
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let eventCount = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      console.info('[AI][api] stream end', {
        eventCount,
        elapsedMs: Math.round(performance.now() - _t0),
      });
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event: StreamEvent = JSON.parse(line.slice(6));
          eventCount += 1;
          console.debug('[AI][api] event', event.type, event);
          onEvent(event);
        } catch (e) {
          console.warn('[AI][api] parse fail', line, e);
        }
      }
    }
  }
};