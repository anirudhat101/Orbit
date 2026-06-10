"use client";

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useRef,
} from "react";
import { ArrowUpIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type MultimodalInputProps = {
  input: string;
  setInput: Dispatch<SetStateAction<string>>;
  sendMessage: (content: string) => Promise<void>;
  status: "ready" | "submitted" | "error";
};

export function MultimodalInput({
  input,
  setInput,
  sendMessage,
  status,
}: MultimodalInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const submitForm = useCallback(() => {
    const text = input.trim();
    if (!text || status !== "ready") return;
    setInput("");
    sendMessage(text);
  }, [input, status, sendMessage, setInput]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitForm();
      }
    },
    [submitForm]
  );

  return (
    <div className="flex w-full flex-col gap-2 rounded-2xl border bg-background p-2">
      <textarea
        ref={textareaRef}
        className="max-h-40 min-h-10 resize-none bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground"
        placeholder="Ask Orbit..."
        rows={1}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={status === "submitted"}
      />

      <div className="flex items-center justify-end px-1 pb-1">
        {status === "submitted" ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="animate-spin">⟳</span>
            Searching on somnia...
          </div>
        ) : (
          <button
            className={cn(
              "flex size-8 items-center justify-center rounded-full transition-colors",
              input.trim()
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground"
            )}
            disabled={!input.trim()}
            onClick={submitForm}
          >
            <ArrowUpIcon className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}
