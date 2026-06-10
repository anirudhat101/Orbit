"use client";

import { useCallback, useRef, useState } from "react";
import { getEventSelector, hexToString } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { ORBIT_ABI } from "@/lib/abi/orbit";
import { generateUUID } from "@/lib/utils";
import {getTokenAddress} from '@/lib/getTokens'
export type OrbitMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  parts: Array<{ type: "text"; text: string }>;
};

const POLL_INTERVAL = 1000;
const MAX_POLLS = 120;
const DEPOSIT_MULTIPLIER = 2n;

function getOrbitAddress(): `0x${string}` | null {
  const addr = process.env.NEXT_PUBLIC_ORBIT_CONTRACT_ADDRESS;
  if (!addr || addr === "0x..." || addr.length < 42) return null;
  return addr as `0x${string}`;
}

function extractRevertReason(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (e.shortMessage && typeof e.shortMessage === "string") {
      return e.shortMessage;
    }
    if (e.details && typeof e.details === "string") {
      return e.details;
    }
    if (e.message && typeof e.message === "string") {
      return e.message;
    }
  }
  return "Transaction failed";
}

export function useOrbitChat() {
  const [messages, setMessages] = useState<OrbitMessage[]>([]);
  const [status, setStatus] = useState<"ready" | "submitted" | "error">(
    "ready"
  );
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const pollingRef = useRef(false);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;
      const orbitAddress = getOrbitAddress();

      if (!orbitAddress) {
        setError(
          "Orbit contract address not configured. Set NEXT_PUBLIC_ORBIT_CONTRACT_ADDRESS in .env"
        );
        setStatus("error");
        return;
      }

      if (!isConnected || !address) {
        setError("Connect your wallet first using the button in the top-right corner");
        setStatus("error");
        return;
      }

      if (!publicClient) {
        setError("Network not available. Check your connection to Somnia Testnet.");
        setStatus("error");
        return;
      }

      const userMsg: OrbitMessage = {
        id: generateUUID(),
        role: "user",
        content,
        parts: [{ type: "text" as const, text: content }],
      };

      setMessages((prev) => [...prev, userMsg]);
      setStatus("submitted");
      setError(null);

      try {
        const [rawDeposit, pricePerAgent, subcommitteeSize] = await Promise.all([
          publicClient.readContract({
            address: orbitAddress,
            abi: ORBIT_ABI,
            functionName: "getRequiredDeposit",
          }),
          publicClient.readContract({
            address: orbitAddress,
            abi: ORBIT_ABI,
            functionName: "PRICE_PER_AGENT",
          }),
          publicClient.readContract({
            address: orbitAddress,
            abi: ORBIT_ABI,
            functionName: "SUBCOMMITTEE_SIZE",
          }),
        ]);

        const depositPerRequest =
          (rawDeposit as bigint) +
          (pricePerAgent as bigint) * (subcommitteeSize as bigint);

        const totalValue = depositPerRequest * DEPOSIT_MULTIPLIER;

        const tokenAddresses = getTokenAddress(content)
        const contentMsg = content + ". Use this address whereever required: " + JSON.stringify(tokenAddresses)
        //". Use this address whereever required: usdc address: 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
        console.log("totalValue ", totalValue.toString())
        const txHash = await writeContractAsync({
          address: orbitAddress,
          abi: ORBIT_ABI,
          functionName: "ask",
          args: [contentMsg],
          value: totalValue,
        });

        const receipt = await publicClient.waitForTransactionReceipt({
          hash: txHash,
        });

        const askEventSig = getEventSelector(
          "Asked(uint256,address,string,uint256)"
        );

        const askedLog = receipt.logs.find(
          (log) =>
            log.topics[0] === askEventSig &&
            log.address.toLowerCase() === orbitAddress.toLowerCase()
        );

        if (!askedLog) {
          throw new Error("Could not find Asked event in transaction logs");
        }

        const queryId = BigInt(askedLog.topics[1]!);

        pollingRef.current = true;
        let answer: string | null = null;

        for (let i = 0; i < MAX_POLLS && pollingRef.current; i++) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL));

          try {
            const result = await publicClient.readContract({
              address: orbitAddress,
              abi: ORBIT_ABI,
              functionName: "queries",
              args: [queryId],
            });
            

            const phase = Number((result as readonly unknown[])[2]);
            const dashboardPayload = (result as readonly unknown[])[5] as `0x${string}`;

            if (phase === 4) {
              if (dashboardPayload && dashboardPayload !== "0x") {
                answer = hexToString(dashboardPayload);
                console.log("result ", answer, "res", result)
              } else {
                answer = "Query processing failed on-chain.";
              }
              break;
            }
          } catch {
            continue;
          }
        }

        pollingRef.current = false;

        if (answer === null) {
          answer = "Query timed out waiting for on-chain response.";
        }

        const assistantMsg: OrbitMessage = {
          id: generateUUID(),
          role: "assistant",
          content: answer,
          parts: [{ type: "text" as const, text: answer }],
        };

        setMessages((prev) => [...prev, assistantMsg]);
        setStatus("ready");
      } catch (err) {
        pollingRef.current = false;

        let message = extractRevertReason(err);

        if (message.includes("reverted") && message.includes("Failed to fetch")) {
          message = [
            "The Orbit contract's agent platform could not reach the off-chain LLM agent.",
            "This means the Somnia Agents network is currently unavailable.",
            "",
            "Make sure:",
            "  - The contract address in .env is correct",
            "  - The Somnia Agents Platform at 0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776 is deployed",
            "  - The Somnia Testnet RPC (dream-rpc.somnia.network) is accessible",
          ].join("\n");
        } else if (message.includes("reverted") && message.includes("Insufficient deposit")) {
          message = [
            "The contract requires a higher deposit.",
            "Make sure your wallet has enough STT and the deposit calculation is correct.",
          ].join("\n");
        } else {
          message = "Transaction failed. Please try again.";
        }

        setError(message);

        const errorMsg: OrbitMessage = {
          id: generateUUID(),
          role: "assistant",
          content: message,
          parts: [{ type: "text" as const, text: message }],
        };

        setMessages((prev) => [...prev, errorMsg]);
        setStatus("error");
      }
    },
    [writeContractAsync, publicClient, isConnected, address]
  );

  const stop = useCallback(() => {
    pollingRef.current = false;
  }, []);

  return {
    messages,
    setMessages,
    sendMessage,
    status,
    stop,
    input,
    setInput,
    error,
  };
}
