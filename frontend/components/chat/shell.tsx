"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { OrbitBrand } from "@/components/orbit-brand";
import { Messages } from "./messages";
import { MultimodalInput } from "./multimodal-input";
import { useActiveChat } from "@/hooks/use-active-chat";

export function ChatShell() {
  const {
    error,
    messages,
    sendMessage,
    status,
    input,
    setInput,
  } = useActiveChat();

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-2 bg-background px-4">
        <OrbitBrand />
        <ConnectButton />
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
        {error && (
          <div className="mx-auto mt-2 w-full max-w-4xl rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <Messages
          messages={messages}
          status={status}
          onSubmit={sendMessage}
        />

        <div className="sticky bottom-0 z-1 mx-auto flex w-full max-w-4xl gap-2 border-t-0 bg-background px-2 pb-3 md:px-4 md:pb-4">
          <MultimodalInput
            input={input}
            sendMessage={sendMessage}
            setInput={setInput}
            status={status}
          />
        </div>
      </div>
    </div>
  );
}
