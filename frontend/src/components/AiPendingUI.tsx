import React, { useState } from 'react';
import { Button, Tag, Typography, Space } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { sendAiConfirmStream, sendAiDisambiguateStream, StreamEvent, AiConfirmPayload, AiDisambiguatePayload } from '../api/ai';
import { AiChatMessage, PendingConfirmation, PendingDisambiguation, ToolAction } from '../types';

const { Text } = Typography;

interface AiPendingUIProps {
  message: AiChatMessage;
  messageIndex: number;
  conversationId: string | undefined;
  onMessageUpdate: (index: number, updated: AiChatMessage) => void;
}

const AiPendingUI: React.FC<AiPendingUIProps> = ({
  message,
  messageIndex,
  conversationId,
  onMessageUpdate,
}) => {
  const [resolving, setResolving] = useState(false);

  const handleConfirm = async (pending: PendingConfirmation) => {
    if (!conversationId || resolving) return;
    setResolving(true);
    let newContent = message.content;
    let newActions = [...(message.actions || [])];

    const payload: AiConfirmPayload = {
      conversation_id: conversationId,
      pending_intent: pending.pending_intent,
      params: pending.params,
      confirmed: true,
    };

    await sendAiConfirmStream(payload, (event: StreamEvent) => {
      switch (event.type) {
        case 'tool_result':
          if (event.tool) {
            newActions = [...newActions, {
              tool: event.tool,
              params: pending.params,
              result: JSON.stringify(event.result ?? {}),
            }];
          }
          break;
        case 'text':
          newContent += (event.content || '');
          break;
        case 'error':
          newContent += '\n' + (event.content || '操作失败');
          break;
      }
    });

    onMessageUpdate(messageIndex, {
      ...message,
      content: newContent,
      actions: newActions,
      pendingConfirmation: undefined,
    });
    setResolving(false);
  };

  const handleCancel = async (pending: PendingConfirmation) => {
    if (!conversationId || resolving) return;
    setResolving(true);
    let newContent = message.content;

    const payload: AiConfirmPayload = {
      conversation_id: conversationId,
      pending_intent: pending.pending_intent,
      params: pending.params,
      confirmed: false,
    };

    await sendAiConfirmStream(payload, (event: StreamEvent) => {
      switch (event.type) {
        case 'text':
          newContent += (event.content || '已取消');
          break;
        case 'error':
          newContent += '\n' + (event.content || '取消失败');
          break;
      }
    });

    onMessageUpdate(messageIndex, {
      ...message,
      content: newContent,
      pendingConfirmation: undefined,
    });
    setResolving(false);
  };

  const handleSelectCandidate = async (
    pending: PendingDisambiguation,
    candidateId: string,
    candidateTitle: string,
  ) => {
    if (!conversationId || resolving) return;
    setResolving(true);
    let newContent = message.content;
    let newActions = [...(message.actions || [])];
    let transitionedToConfirmation = false;

    const payload: AiDisambiguatePayload = {
      conversation_id: conversationId,
      pending_intent: pending.pending_intent,
      selected_id: candidateId,
      extra_params: pending.extra_params,
    };

    await sendAiDisambiguateStream(payload, (event: StreamEvent) => {
      switch (event.type) {
        case 'tool_result':
          if (event.tool) {
            const result = event.result ?? {};
            if (result._pending_confirmation) {
              transitionedToConfirmation = true;
              onMessageUpdate(messageIndex, {
                ...message,
                content: newContent,
                actions: newActions,
                pendingDisambiguation: undefined,
                pendingConfirmation: {
                  pending_intent: result.intent,
                  params: result.params,
                  target_description: candidateTitle,
                  reply: `确认删除「${candidateTitle}」？`,
                },
              });
              setResolving(false);
              return;
            }
            newActions = [...newActions, {
              tool: event.tool,
              params: {},
              result: JSON.stringify(result),
            }];
          }
          break;
        case 'text':
          if (!transitionedToConfirmation) {
            newContent += (event.content || '');
          }
          break;
        case 'error':
          newContent += '\n' + (event.content || '操作失败');
          break;
      }
    });

    if (!transitionedToConfirmation) {
      onMessageUpdate(messageIndex, {
        ...message,
        content: newContent,
        actions: newActions,
        pendingDisambiguation: undefined,
      });
    }
    setResolving(false);
  };

  const { pendingConfirmation, pendingDisambiguation } = message;

  if (pendingConfirmation) {
    return (
      <div className="ai-pending-confirmation">
        <div className="ai-pending-prompt">
          <Tag color="red">删除确认</Tag>
          <Text>{pendingConfirmation.reply}</Text>
        </div>
        <Space size="small" className="ai-pending-buttons">
          <Button
            type="primary"
            danger
            size="small"
            icon={<CheckOutlined />}
            loading={resolving}
            onClick={() => handleConfirm(pendingConfirmation)}
          >
            确认删除
          </Button>
          <Button
            size="small"
            icon={<CloseOutlined />}
            loading={resolving}
            onClick={() => handleCancel(pendingConfirmation)}
          >
            取消
          </Button>
        </Space>
      </div>
    );
  }

  if (pendingDisambiguation) {
    return (
      <div className="ai-pending-disambiguation">
        <div className="ai-pending-prompt">
          <Tag color="orange">选择目标</Tag>
          <Text>{pendingDisambiguation.reply}</Text>
        </div>
        <div className="ai-pending-candidates">
          {pendingDisambiguation.candidates.map((c) => (
            <Button
              key={c.id}
              size="small"
              type="text"
              className="ai-pending-candidate-btn"
              loading={resolving}
              onClick={() => handleSelectCandidate(pendingDisambiguation, c.id, c.title)}
            >
              {c.title || '(未命名)'}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return null;
};

export default AiPendingUI;