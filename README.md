# Orbit

Orbit is an **agent-driven blockchain intelligence layer** on the Somnia blockchain. Orbit is an AI agent for Somnia that lets users interact with the blockchain using natural language, from answering questions and generating insights to executing actions like swaps, transfers, and monitoring.


<img width="400" height="400" alt="orbit" src="https://github.com/user-attachments/assets/bb611b40-4893-41cf-a2c1-312ea4df94f0" />

Demo Video: https://drive.google.com/file/d/1wynr2kFKCdtKKgOgVvO7JGM_fKBMllHQ/view?usp=sharing

## Problem Statement

Blockchain data is fragmented across explorers, dashboards, and APIs. Getting a simple answer like *"What's the net worth of wallet 0x...?"* or *"Swap 1 STT to USDC"* requires switching between multiple tools, writing RPC calls, or understanding complex DeFi protocols. There is no unified, natural-language interface for on-chain intelligence that is itself powered by a decentralized network.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Frontend                            │
│  Next.js (RainbowKit + Wagmi + viem)                        │
│  ┌─────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ Chat UI      │  │ SwapCard Widget  │  │ Wallet Connect│  │
│  └──────┬───────┘  └──────────────────┘  └───────────────┘  │
│         │ sendMessage(query)                                 │
│         │ polls queries(queryId)                             │
└─────────┼───────────────────────────────────────────────────┘
          │ tx: ask(query)
          ▼
┌─────────────────────────────────────────────────────────────┐
│                  Orbit Smart Contract                        │
│  (Somnia Testnet - chain ID 50312)                           │
│                                                              │
│  ask(query) → handleToolSelection() → handleSynthesis()      │
│       │              │                        │              │
│       │    ┌─────────┴──────────┐      ┌──────┴──────┐       │
│       │    │ On-chain Tools     │      │ LLM         │       │
│       │    │ - swap()           │      │ Synthesis   │       │
│       │    │ - pool state       │      │ Pass        │       │
│       │    │ - pool liquidity   │      └──────┬──────┘       │
│       │    │ - pool fee         │             │              │
│       │    └────────────────────┘             │              │
│       │                                       │              │
│       └──────────┐              ┌─────────────┘              │
│                  ▼              ▼                            │
│         ┌────────────────────────────────────┐               │
│         │  Somnia Agents Platform            │               │
│         │  0x037Bb9C718F3f7fe5eCBDB0b600D... │               │
│         │  3 Validators → Consensus → Callback│              │
│         └──────────┬─────────────────────────┘               │
│                    │ LLM inference                            │
│                    ▼                                          │
│         ┌──────────────────┐                                  │
│         │  MCP Server      │ ◄── LLM calls tools              │
│         │  (onchain-data)  │     (token price, holders,       │
│         │                  │      net worth, etc.)            │
│         └──────────────────┘                                  │
└─────────────────────────────────────────────────────────────┘
```

### Components

- **Orbit.sol** — Smart contract that orchestrates the full lifecycle: accepts user queries, requests LLM inference from the Somnia Agents Platform, dispatches on-chain tools, collects results, and produces a final answer.
- **Prompt.sol** — System prompt library that tells the LLM about supported tokens, protocols (Quickswap), and the expected JSON response format for swaps.
- **Tools.sol** — On-chain tool implementations the LLM can call (swap parameter preparation, pool state reads).
- **Somnia Agents Platform** — Decentralized network of validators that run LLM inference and reach consensus before returning results via callbacks.
- **MCP Server** — Model Context Protocol server exposing off-chain data tools (token prices, holders, wallet net worth, PnL) via Moralis API.
- **Frontend** — Next.js chat interface with WalletConnect, real-time polling for answers, and an interactive SwapCard widget for executing token swaps via Quickswap.

## How It Works

### Query Lifecycle

1. **User submits a query** via the chat interface. The frontend reads deposit parameters from the Orbit contract and calls `ask(query)` with a STT deposit.

2. **Orbit contract composes a prompt** combining the system prompt (Prompt.sol), registered on-chain tool definitions, and the MCP server URL. It sends this to the Somnia Agents Platform via `createRequest()`.

3. **Validator subcommittee runs the LLM** (3 validators reach consensus). The LLM analyzes the query and decides whether to return an answer directly or call tools.

4. **Tool selection callback** — If the LLM chooses on-chain tools (swap, pool data), Orbit executes them immediately and stores results. Tools requiring off-chain data are handled by the MCP server during LLM inference.

5. **Synthesis pass** — After all tool results are collected, Orbit creates a second LLM request for final synthesis, feeding tool outputs as context.

6. **Answer returned** — The LLM's final response is stored as `dashboardPayload`, remaining STT is refunded, and the `Answered` event is emitted.

7. **Frontend polls** for completion, decodes the answer, and displays it. If the answer contains a swap JSON payload, an interactive SwapCard appears for one-click swap execution via Quickswap.

### Swap Flow

When the LLM detects a swap intent, it returns a structured JSON:
```json
{
  "answer": "Swap 1 STT for ~0.1177 USDC",
  "swap": {
    "tokenIn": "0x...",
    "tokenOut": "0x...",
    "amountIn": "1000000000000000000",
    "amountOutMinimum": "0"
  }
}
```
The frontend renders the answer text and an interactive SwapCard. Users approve the token (if needed) and execute the swap directly from the browser via the Quickswap router.
