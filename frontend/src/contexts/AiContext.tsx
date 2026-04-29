import React, { createContext, useContext, useState, useCallback } from 'react';
import { AiChatMessage } from '../types';

interface AiContextType {
  messages: AiChatMessage[];
  conversationId: string | undefined;
  loading: boolean;
  panelVisible: boolean;
  setMessages: React.Dispatch<React.SetStateAction<AiChatMessage[]>>;
  setConversationId: React.Dispatch<React.SetStateAction<string | undefined>>;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  openPanel: () => void;
  closePanel: () => void;
  newConversation: () => void;
}

const AiContext = createContext<AiContextType | null>(null);

export const useAiContext = () => {
  const ctx = useContext(AiContext);
  if (!ctx) throw new Error('useAiContext must be used within AiProvider');
  return ctx;
};

export const AiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [panelVisible, setPanelVisible] = useState(false);

  const openPanel = useCallback(() => setPanelVisible(true), []);
  const closePanel = useCallback(() => setPanelVisible(false), []);
  const newConversation = useCallback(() => {
    setMessages([]);
    setConversationId(undefined);
  }, []);

  return (
    <AiContext.Provider value={{
      messages, conversationId, loading, panelVisible,
      setMessages, setConversationId, setLoading,
      openPanel, closePanel, newConversation,
    }}>
      {children}
    </AiContext.Provider>
  );
};