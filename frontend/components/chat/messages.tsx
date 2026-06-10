import { useEffect, useRef } from "react";
import type { OrbitMessage } from "@/hooks/use-orbit-chat";
import { cn } from "@/lib/utils";
import { Greeting } from "./greeting";
import { PreviewMessage, ThinkingMessage } from "./message";

type MessagesProps = {
  status: "ready" | "submitted" | "error";
  messages: OrbitMessage[];
  onSubmit?: (text: string) => void;
};

function PureMessages({ status, messages, onSubmit }: MessagesProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden",
        messages.length === 0 ? "justify-center" : "justify-start"
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-4xl flex-col gap-4 px-4",
          messages.length === 0 ? "py-16" : "py-8"
        )}
      >
        {messages.length === 0 && <Greeting onSubmit={onSubmit!} />}

        {messages.map((message) => (
          <PreviewMessage key={message.id} message={message} />
        ))}

        {status === "submitted" &&
          messages.at(-1)?.role !== "assistant" && (
            <ThinkingMessage />
          )}
      </div>

      <div ref={endRef} />
    </div>
  );
}

export const Messages = PureMessages;
