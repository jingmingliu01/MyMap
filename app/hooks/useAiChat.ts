import { useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import type { ChatMessage, MapStateResponse } from "../../src/shared/schema";
import { apiPost } from "../lib/api-client";
import { messageFromError } from "../lib/errors";

interface UseAiChatOptions {
  chatMessage: string;
  setChatMessage: (message: string) => void;
  chatMessages: ChatMessage[];
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  setMapState: (state: MapStateResponse) => void;
  setStatus: (message: string) => void;
  setError: (message: string | null) => void;
  onPreviewReady: () => void;
  clientMessageHistory: number;
}

export function useAiChat({
  chatMessage,
  setChatMessage,
  chatMessages,
  setChatMessages,
  setMapState,
  setStatus,
  setError,
  onPreviewReady,
  clientMessageHistory
}: UseAiChatOptions) {
  const [aiResponse, setAiResponse] = useState("");
  const [isWorking, setIsWorking] = useState(false);

  async function submitChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = chatMessage.trim();
    if (!message) {
      return;
    }

    setIsWorking(true);
    setError(null);
    setStatus("正在生成 AI 预览...");
    try {
      const result = await apiPost<MapStateResponse & { response_text?: string }>("/api/chat", {
        message,
        messages: chatMessages
      });
      const assistantMessage = result.response_text ?? "已生成预览，等待确认。";
      setMapState(result);
      setAiResponse(assistantMessage);
      const nextMessages: ChatMessage[] = [
        { role: "user", content: message },
        { role: "assistant", content: assistantMessage }
      ];
      setChatMessages((currentMessages) =>
        [...currentMessages, ...nextMessages].slice(-clientMessageHistory)
      );
      onPreviewReady();
      setStatus("");
    } catch (caught) {
      const messageText = messageFromError(caught);
      setError(messageText);
      setStatus(messageText);
    } finally {
      setIsWorking(false);
    }
  }

  return {
    aiResponse,
    setAiResponse,
    isWorking,
    setIsWorking,
    submitChat,
    setChatMessage
  };
}
