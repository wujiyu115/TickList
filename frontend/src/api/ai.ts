import api from './index';
import { AiChatResponse } from '../types';

export const sendAiChat = async (message: string, conversationId?: string): Promise<AiChatResponse> => {
  return api.post('/ai/chat', { message, conversation_id: conversationId }, { timeout: 120000 });
};