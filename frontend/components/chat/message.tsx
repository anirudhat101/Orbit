"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import { useAccount } from "wagmi";
import { SwapCard } from "@/components/swap/swap-card";
import { parseSwapFromJson } from "@/lib/quickswap";
import { cn } from "@/lib/utils";

function extractAnswerFromJson(text: string): string | null {
  try { return JSON.parse(text)?.answer ?? null; } catch { return null; }
}

const PurePreviewMessage = (
  props: Record<string, unknown> & {
    message: { id: string; role: string; parts: readonly unknown[] };
  }
) => {
  const { message } = props;
  const { address } = useAccount();
  const isAssistant = message.role === "assistant";

  const textParts = (
    message.parts as Array<{ type: string; text?: string }>
  ).filter((p) => p.type === "text");

  const fullText = textParts.map((p) => p.text ?? "").join("");
  const parsedSwap = isAssistant ? parseSwapFromJson(fullText) : null;

  const displayText = parsedSwap
    ? parsedSwap.answer
    : extractAnswerFromJson(fullText) ?? fullText;

  const txSentRef = useCallback(
    (txHash: `0x${string}`) => {
      toast.success("Swap transaction sent!", {
        description: `Tx: ${txHash.slice(0, 10)}...`,
      });
    },
    []
  );

  const onError = useCallback((msg: string) => {
    toast.error(msg);
  }, []);

  return (
    <div
      className={cn(
        "flex w-full",
        message.role === "user" ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "flex max-w-[80%] flex-col gap-3",
          message.role === "user" && "items-end"
        )}
      >
        {isAssistant && (
          <div className="flex items-center gap-2">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
            </div>
          </div>
        )}

        <div
          className={cn(
            "rounded-2xl px-4 py-2 text-sm leading-relaxed whitespace-pre-wrap",
            message.role === "user"
              ? "bg-primary text-primary-foreground"
              : "bg-muted"
          )}
        >
          <div>{displayText.replace(/\*\*/g, "")}</div>
        </div>

        {parsedSwap && address && (
          <SwapCard
            data={parsedSwap.swap}
            userAddress={address}
            onSuccess={txSentRef}
            onError={onError}
          />
        )}
      </div>
    </div>
  );
};

export const PreviewMessage = PurePreviewMessage;

export function ThinkingMessage() {
  return (
    <div className="flex justify-start">
      <div className="flex max-w-[80%] gap-3">
        <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        </div>
        <div className="rounded-2xl bg-muted px-4 py-2 text-sm text-muted-foreground">
          <span className="animate-pulse">
            Searching on somnia...
          </span>
        </div>
      </div>
    </div>
  );
}
