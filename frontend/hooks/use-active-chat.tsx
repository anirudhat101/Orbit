"use client";

import {
  createContext,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useContext,
  useMemo,
} from "react";
import { useOrbitChat, type OrbitMessage } from "@/hooks/use-orbit-chat";

type ActiveChatContextValue = {
  chatId: string;
  messages: OrbitMessage[];
  setMessages: Dispatch<SetStateAction<OrbitMessage[]>>;
  sendMessage: (content: string) => Promise<void>;
  status: "ready" | "submitted" | "error";
  stop: () => void;
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  error: string | null;
};

const ActiveChatContext = createContext<ActiveChatContextValue | null>(null);

export function ActiveChatProvider({ children }: { children: ReactNode }) {
  const {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    input,
    setInput,
    error,
  } = useOrbitChat();

  const value = useMemo<ActiveChatContextValue>(
    () => ({
      chatId: "orbit",
      messages,
      setMessages,
      sendMessage,
      status,
      stop,
      input,
      setInput,
      error,
    }),
    [messages, setMessages, sendMessage, status, stop, input, setInput, error]
  );

  return (
    <ActiveChatContext.Provider value={value}>
      {children}
    </ActiveChatContext.Provider>
  );
}

export function useActiveChat() {
  const context = useContext(ActiveChatContext);
  if (!context) {
    throw new Error("useActiveChat must be used within ActiveChatProvider");
  }
  return context;
}
