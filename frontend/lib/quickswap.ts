export const QUICKSWAP_ROUTER_ADDRESS: `0x${string}` =
  "0xE94de02e52Eaf9F0f6Bf7f16E4927FcBc2c09bC7";

export const QUICKSWAP_ALGEBRA_DEPLOYER: `0x${string}` =
  "0x0000000000000000000000000000000000000000";

export const QUICKSWAP_ROUTER_ABI = [
  {
    inputs: [
      {
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "deployer", type: "address" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "limitSqrtPrice", type: "uint160" },
        ],
        name: "params",
        type: "tuple",
      },
    ],
    name: "exactInputSingle",
    outputs: [{ name: "amountOut", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
] as const;

export const ERC20_ABI = [
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

export type SwapData = {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: string;
  amountOutMinimum: string;
};

export function parseSwapFromJson(
  content: string
): { answer: string; swap: SwapData } | null {
  let jsonStr = content.trim();

  const braceIdx = jsonStr.indexOf("{");
  if (braceIdx > 0) {
    jsonStr = jsonStr.slice(braceIdx);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    try {
      const match = jsonStr.match(/\{.*\}/s);
      if (!match) return null;
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  // nested format: {"answer":"...","swap":{"tokenIn":"...","tokenOut":"...",...}}
  if (parsed.swap && typeof parsed.swap === "object" && parsed.answer) {
    const s = parsed.swap as Record<string, unknown>;
    return {
      answer: String(parsed.answer),
      swap: {
        tokenIn: s.tokenIn as `0x${string}`,
        tokenOut: s.tokenOut as `0x${string}`,
        amountIn: s.amountIn?.toString() ?? "0",
        amountOutMinimum: s.amountOutMinimum?.toString() ?? "0",
      },
    };
  }

  // flat format: {"answer":"...","action":"swap","tokenIn":"...","tokenOut":"...",...}
  if (parsed.action === "swap" && parsed.answer && parsed.tokenIn) {
    return {
      answer: String(parsed.answer),
      swap: {
        tokenIn: parsed.tokenIn as `0x${string}`,
        tokenOut: parsed.tokenOut as `0x${string}`,
        amountIn: parsed.amountIn?.toString() ?? "0",
        amountOutMinimum: parsed.amountOutMinimum?.toString() ?? "0",
      },
    };
  }

  return null;
}
