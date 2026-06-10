"use client";

import { useCallback, useState } from "react";
import { useWriteContract } from "wagmi";
import {
  ERC20_ABI,
  QUICKSWAP_ALGEBRA_DEPLOYER,
  QUICKSWAP_ROUTER_ABI,
  QUICKSWAP_ROUTER_ADDRESS,
  type SwapData,
} from "@/lib/quickswap";
import {
  TOKENS,
  getTokenByAddress,
  isNativeToken,
  type TokenInfo,
} from "@/lib/tokens";
import { calculateAmountOut } from "@/lib/rates";
import { cn } from "@/lib/utils";

type SwapCardProps = {
  data: SwapData;
  userAddress?: `0x${string}`;
  onSuccess?: (txHash: `0x${string}`) => void;
  onError?: (msg: string) => void;
};

export function SwapCard({
  data,
  userAddress,
  onSuccess,
  onError,
}: SwapCardProps) {
  const tokenIn = getTokenByAddress(data.tokenIn);
  const tokenOut = getTokenByAddress(data.tokenOut);

  const [selectedIn, setSelectedIn] = useState<TokenInfo>(
    tokenIn ?? TOKENS[0]
  );
  const [selectedOut, setSelectedOut] = useState<TokenInfo>(
    tokenOut ?? TOKENS[1]
  );
  const [amountIn, setAmountIn] = useState(
    formatAmount(data.amountIn, selectedIn.decimals)
  );
  const [slippage, setSlippage] = useState(0.5);
  const [showSettings, setShowSettings] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approved, setApproved] = useState(false);
  const [swapping, setSwapping] = useState(false);

  const needsApproval =
    !isNativeToken(selectedIn.address as `0x${string}`) && !approved;

  const { writeContractAsync } = useWriteContract();

  const handleApprove = useCallback(async () => {
    if (!userAddress) return;
    setApproving(true);
    try {
      const amountInWei = toWei(data.amountIn, selectedIn.decimals);
      await writeContractAsync({
        address: selectedIn.address,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [QUICKSWAP_ROUTER_ADDRESS, amountInWei],
      });
      setApproved(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Approval failed";
      console.error("Approve error:", err);
      onError?.(msg);
    } finally {
      setApproving(false);
    }
  }, [userAddress, selectedIn.address, data.amountIn, selectedIn.decimals, writeContractAsync, onError]);

  const handleSwap = useCallback(async () => {
    if (!userAddress) return;
    setSwapping(true);
    try {
      const isNative = isNativeToken(selectedIn.address as `0x${string}`);

      const tokenInAddr = isNative
        ? (getTokenByAddress("0x4A3BC48C156384f9564Fd65A53a2f3D534D8f2b7")
            ?.address ?? selectedIn.address)
        : selectedIn.address;

      const amountInWei = toWei(data.amountIn, selectedIn.decimals);

      const txHash = await writeContractAsync({
        address: QUICKSWAP_ROUTER_ADDRESS,
        abi: QUICKSWAP_ROUTER_ABI,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: tokenInAddr,
            tokenOut: selectedOut.address,
            deployer: QUICKSWAP_ALGEBRA_DEPLOYER,
            recipient: userAddress,
            deadline: BigInt(Math.floor(Date.now() / 1000) + 300),
            amountIn: amountInWei,
            amountOutMinimum: BigInt(data.amountOutMinimum),
            limitSqrtPrice: 0n,
          },
        ],
        value: isNative ? amountInWei : undefined,
      });
      setSwapping(false);
      onSuccess?.(txHash);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Swap failed or was rejected";
      console.error("Swap error:", err);
      onError?.(msg);
      setSwapping(false);
    }
  }, [
    userAddress,
    selectedIn.address,
    selectedIn.decimals,
    selectedOut.address,
    data.amountIn,
    data.amountOutMinimum,
    writeContractAsync,
    onSuccess,
    onError,
  ]);

  const switchTokens = useCallback(() => {
    setSelectedIn(selectedOut);
    setSelectedOut(selectedIn);
  }, [selectedIn, selectedOut]);

  return (
    <div className="w-full max-w-md rounded-2xl border bg-card p-4 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">Swap</h3>
        <button
          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          onClick={() => setShowSettings(!showSettings)}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        </button>
      </div>

      {/* Slippage settings */}
      {showSettings && (
        <div className="mb-4 rounded-xl bg-muted p-3">
          <label className="mb-1 text-xs text-muted-foreground">
            Slippage tolerance
          </label>
          <div className="flex gap-2">
            {[0.1, 0.5, 1.0].map((s) => (
              <button
                key={s}
                className={cn(
                  "rounded-lg px-3 py-1 text-sm",
                  slippage === s
                    ? "bg-primary text-primary-foreground"
                    : "bg-background hover:bg-muted-foreground/10"
                )}
                onClick={() => setSlippage(s)}
              >
                {s}%
              </button>
            ))}
            <input
              className="w-16 rounded-lg bg-background px-2 py-1 text-sm text-right"
              type="number"
              step="0.1"
              min="0.1"
              max="50"
              value={slippage}
              onChange={(e) => setSlippage(Number(e.target.value))}
            />
          </div>
        </div>
      )}

      {/* You pay */}
      <div className="mb-1 rounded-xl bg-muted p-3">
        <div className="mb-2 text-xs text-muted-foreground">You pay</div>
        <div className="flex items-center gap-2">
          <input
            className="flex-1 bg-transparent text-xl font-medium outline-none"
            type="text"
            value={amountIn}
            readOnly
          />
          <TokenBadge token={selectedIn} />
        </div>
      </div>

      {/* Switch button */}
      <div className="flex justify-center -my-3 relative z-10">
        <button
          className="flex size-10 items-center justify-center rounded-full border bg-background shadow-sm hover:bg-muted"
          onClick={switchTokens}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 16V4M7 4L3 8M7 4L11 8M17 8v12M17 20l4-4M17 20l-4-4"/></svg>
        </button>
      </div>

      {/* You receive */}
      <div className="mt-1 rounded-xl bg-muted p-3">
        <div className="mb-2 text-xs text-muted-foreground">You receive</div>
        <div className="flex items-center gap-2">
          <div className="flex-1 text-xl font-medium">
            {formatOutAmount(data.amountIn, data.amountOutMinimum, slippage, selectedIn.decimals, selectedOut.decimals, selectedIn.symbol, selectedOut.symbol)}
          </div>
          <TokenBadge token={selectedOut} />
        </div>
      </div>

      {/* Info row */}
      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
        <div className="flex justify-between">
          <span>Rate</span>
          <span>
            1 {selectedIn.symbol} ≈ {formatRate(data.amountIn, data.amountOutMinimum, selectedIn.decimals, selectedOut.decimals, selectedIn.symbol, selectedOut.symbol)} {selectedOut.symbol}
          </span>
        </div>
        {/* <div className="flex justify-between">
          <span>Min. received</span>
          <span>
            {formatAmount(data.amountOutMinimum, selectedOut.decimals)}{" "}
            {selectedOut.symbol}
          </span>
        </div> */}
        <div className="flex justify-between">
          <span>Slippage</span>
          <span>{slippage}%</span>
        </div>
      </div>

      {/* Action button */}
      {!userAddress ? (
        <div className="mt-4 rounded-xl bg-muted py-3 text-center text-sm text-muted-foreground">
          Connect wallet to swap
        </div>
      ) : needsApproval ? (
        <button
          className="mt-4 flex w-full items-center justify-center rounded-xl bg-primary py-3 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          disabled={approving}
          onClick={handleApprove}
        >
          {approving ? "Approving..." : `Approve ${selectedIn.symbol}`}
        </button>
      ) : (
        <button
          className="mt-4 flex w-full items-center justify-center rounded-xl bg-primary py-3 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          disabled={swapping}
          onClick={handleSwap}
        >
          {swapping ? "Swapping..." : "Swap"}
        </button>
      )}
    </div>
  );
}

function TokenBadge({ token }: { token: TokenInfo }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full bg-background px-3 py-1.5 text-sm font-medium">
      <div className="flex size-5 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
        {token.symbol[0]}
      </div>
      {token.symbol}
    </div>
  );
}

function isRawAmount(amount: string): boolean {
  return !amount.includes(".");
}

function toWei(amount: string, decimals: number): bigint {
  if (isRawAmount(amount)) return BigInt(amount);
  const parts = amount.split(".");
  const decPart = (parts[1] ?? "").padEnd(decimals, "0").slice(0, decimals);
  return BigInt(parts[0] + decPart);
}

function formatAmount(amount: string, decimals: number): string {
  try {
    const val = isRawAmount(amount)
      ? Number(amount) / 10 ** decimals
      : Number(amount);
    if (val === 0) return "0";
    if (val < 0.0001) return val.toExponential(2);
    return val.toLocaleString(undefined, {
      maximumFractionDigits: 6,
    });
  } catch {
    return "0";
  }
}

function formatOutAmount(
  amountIn: string,
  amountOutMin: string,
  slippage: number,
  decimalsIn: number,
  decimalsOut: number,
  symbolIn: string,
  symbolOut: string
): string {
  try {
    const outVal = calculateAmountOut(amountIn, decimalsIn, decimalsOut, symbolIn, symbolOut);
    if (outVal === 0) return "0";
    if (outVal < 0.0001) return outVal.toExponential(2);
    return outVal.toLocaleString(undefined, { maximumFractionDigits: 6 });
  } catch {
    return "0";
  }
}

function formatRate(
  amountIn: string,
  amountOutMin: string,
  decimalsIn: number,
  decimalsOut: number,
  symbolIn: string,
  symbolOut: string
): string {
  try {
    const outVal = calculateAmountOut(amountIn, decimalsIn, decimalsOut, symbolIn, symbolOut);
    const inVal = isRawAmount(amountIn)
      ? Number(amountIn) / 10 ** decimalsIn
      : Number(amountIn);
    if (inVal === 0) return "0";
    const rate = outVal / inVal;
    if (rate < 0.0001) return rate.toExponential(2);
    return rate.toFixed(6);
  } catch {
    return "0";
  }
}
