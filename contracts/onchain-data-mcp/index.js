import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import dotenv from "dotenv";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, ".env") });

const MORALIS_API_KEY = process.env.MORALIS_API_KEY;
if (!MORALIS_API_KEY) {
  console.error("MORALIS_API_KEY environment variable is required");
  process.exit(1);
}

const MORALIS_BASE = "https://deep-index.moralis.io/api/v2.2";

async function moralisFetch(path) {
  const res = await fetch(`${MORALIS_BASE}${path}`, {
    headers: { "X-API-Key": MORALIS_API_KEY },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Moralis API error ${res.status}: ${text}`);
  }
  return res.json();
}

function createServer() {
  const srv = new McpServer(
    { name: "onchain-data-mcp", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  srv.registerTool(
    "get_token_price",
    {
      title: "Get Token Price",
      description: "Get the current price of an ERC20 token",
      inputSchema: z.object({
        address: z.string().describe("The ERC20 token contract address"),
        chain: z.string().default("eth").describe("The chain (eth, polygon, bsc, etc.)"),
      }),
    },
    async (args) => {
      const validated = z.object({
        address: z.string(),
        chain: z.string().default("eth"),
      }).parse(args);
      const data = await moralisFetch(`/erc20/${validated.address}/price?chain=${validated.chain}`);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  srv.registerTool(
    "get_token_holders",
    {
      title: "Get Token Holders",
      description: "Get the top holders of an ERC20 token",
      inputSchema: z.object({
        address: z.string().describe("The ERC20 token contract address"),
        chain: z.string().default("eth").describe("The chain (eth, polygon, bsc, etc.)"),
      }),
    },
    async (args) => {
      const validated = z.object({
        address: z.string(),
        chain: z.string().default("eth"),
      }).parse(args);
      const data = await moralisFetch(`/erc20/${validated.address}/owners?chain=${validated.chain}`);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  srv.registerTool(
    "get_wallet_net_worth",
    {
      title: "Get Wallet Net Worth",
      description: "Calculate the total net worth of a wallet in USD across multiple chains",
      inputSchema: z.object({
        address: z.string().describe("The wallet address"),
        chains: z.string().optional().describe("Comma-separated chain names to query (e.g. eth,polygon,bsc)"),
        exclude_spam: z.boolean().default(true).describe("Exclude spam tokens from calculation"),
        exclude_unverified_contracts: z.boolean().default(true).describe("Exclude unverified contracts from calculation"),
      }),
    },
    async (args) => {
      const validated = z.object({
        address: z.string(),
        chains: z.string().optional(),
        exclude_spam: z.boolean().default(true),
        exclude_unverified_contracts: z.boolean().default(true),
      }).parse(args);
      let path = `/wallets/${validated.address}/net-worth?exclude_spam=${validated.exclude_spam}&exclude_unverified_contracts=${validated.exclude_unverified_contracts}`;
      if (validated.chains) {
        path += `&chains=${validated.chains}`;
      }
      const data = await moralisFetch(path);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  srv.registerTool(
    "get_wallet_pnl_summary",
    {
      title: "Get Wallet PnL Summary",
      description: "Get a profit and loss summary for a given wallet over a specified timeframe",
      inputSchema: z.object({
        address: z.string().describe("The wallet address"),
        chain: z.string().default("eth").describe("The chain (eth, polygon, bsc, etc.)"),
        days: z.string().default("all").describe("Timeframe in days: 'all', '7', '30', '60', '90'"),
      }),
    },
    async (args) => {
      const validated = z.object({
        address: z.string(),
        chain: z.string().default("eth"),
        days: z.string().default("all"),
      }).parse(args);
      const data = await moralisFetch(`/wallets/${validated.address}/profitability/summary?chain=${validated.chain}&days=${validated.days}`);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  srv.registerTool(
    "get_token_transfers",
    {
      title: "Get Token Transfers by Wallet",
      description: "Get all ERC20 token transfers for a given wallet address, sorted by block number (newest first)",
      inputSchema: z.object({
        address: z.string().describe("The wallet address"),
        chain: z.string().default("eth").describe("The chain (eth, polygon, bsc, etc.)"),
        limit: z.number().int().min(1).max(100).optional().describe("Number of results to return (max 100)"),
        cursor: z.string().optional().describe("Cursor for pagination"),
      }),
    },
    async (args) => {
      const validated = z.object({
        address: z.string(),
        chain: z.string().default("eth"),
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }).parse(args);
      let path = `/${validated.address}/erc20/transfers?chain=${validated.chain}`;
      if (validated.limit) path += `&limit=${validated.limit}`;
      if (validated.cursor) path += `&cursor=${validated.cursor}`;
      const data = await moralisFetch(path);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  srv.registerTool(
    "get_nfts_by_wallet",
    {
      title: "Get NFTs by Wallet",
      description: "Get all NFTs (ERC721 and ERC1155) owned by a wallet address",
      inputSchema: z.object({
        address: z.string().describe("The wallet address"),
        chain: z.string().default("eth").describe("The chain (eth, polygon, bsc, etc.)"),
        limit: z.number().int().min(1).max(100).optional().describe("Number of results to return (max 100)"),
        cursor: z.string().optional().describe("Cursor for pagination"),
      }),
    },
    async (args) => {
      const validated = z.object({
        address: z.string(),
        chain: z.string().default("eth"),
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }).parse(args);
      let path = `/${validated.address}/nft?chain=${validated.chain}`;
      if (validated.limit) path += `&limit=${validated.limit}`;
      if (validated.cursor) path += `&cursor=${validated.cursor}`;
      const data = await moralisFetch(path);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  srv.registerTool(
    "get_token_transfers_by_contract",
    {
      title: "Get Token Transfers by Contract",
      description: "Get all ERC20 token transfers for a contract address, ordered by block number (newest first)",
      inputSchema: z.object({
        address: z.string().describe("The ERC20 token contract address"),
        chain: z.string().default("eth").describe("The chain (eth, polygon, bsc, etc.)"),
        from_block: z.number().int().optional().describe("Start block number"),
        to_block: z.number().int().optional().describe("End block number"),
        limit: z.number().int().min(1).max(100).optional().describe("Number of results to return (max 100)"),
        cursor: z.string().optional().describe("Cursor for pagination"),
      }),
    },
    async (args) => {
      const validated = z.object({
        address: z.string(),
        chain: z.string().default("eth"),
        from_block: z.number().int().optional(),
        to_block: z.number().int().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }).parse(args);
      let path = `/erc20/${validated.address}/transfers?chain=${validated.chain}`;
      if (validated.from_block) path += `&from_block=${validated.from_block}`;
      if (validated.to_block) path += `&to_block=${validated.to_block}`;
      if (validated.limit) path += `&limit=${validated.limit}`;
      if (validated.cursor) path += `&cursor=${validated.cursor}`;
      const data = await moralisFetch(path);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  srv.registerTool(
    "get_top_gainers",
    {
      title: "Get Top Gainers",
      description: "Identify tokens with the highest price increases over a period",
      inputSchema: z.object({
        chain: z.string().optional().describe("Comma-separated chain names to filter (e.g. eth,polygon,bsc)"),
        limit: z.number().int().min(1).max(50).optional().describe("Number of results to return (max 50)"),
      }),
    },
    async (args) => {
      const validated = z.object({
        chain: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }).parse(args);
      let path = `/discovery/tokens/top-gainers`;
      const params = [];
      if (validated.chain) params.push(`chain=${validated.chain}`);
      if (validated.limit) params.push(`limit=${validated.limit}`);
      if (params.length) path += `?${params.join("&")}`;
      const data = await moralisFetch(path);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  srv.registerTool(
    "get_top_losers",
    {
      title: "Get Top Losers",
      description: "Identify tokens with the highest price decreases over a period",
      inputSchema: z.object({
        chain: z.string().optional().describe("Comma-separated chain names to filter (e.g. eth,polygon,bsc)"),
        limit: z.number().int().min(1).max(50).optional().describe("Number of results to return (max 50)"),
      }),
    },
    async (args) => {
      const validated = z.object({
        chain: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }).parse(args);
      let path = `/discovery/tokens/top-losers`;
      const params = [];
      if (validated.chain) params.push(`chain=${validated.chain}`);
      if (validated.limit) params.push(`limit=${validated.limit}`);
      if (params.length) path += `?${params.join("&")}`;
      const data = await moralisFetch(path);
      return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      };
    }
  );

  return srv;
}

const sessions = new Map();

const app = express();
app.use(express.json());
app.use(cors({
  origin: "*",
  methods: "GET,POST,DELETE,OPTIONS",
  exposedHeaders: ["mcp-session-id", "last-event-id", "mcp-protocol-version"],
}));

app.post("/mcp", async (req, res) => {
  try {
    if (!req.headers.accept) {
      req.headers.accept = "application/json, text/event-stream";
    }

    const sessionId = req.headers["mcp-session-id"];
    let transport, srv;

    if (sessionId && sessions.has(sessionId)) {
      ({ transport, srv } = sessions.get(sessionId));
    } else {
      // Generate the ID eagerly so we can store the session BEFORE handleRequest runs
      const newSessionId = randomUUID();

      srv = createServer();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => newSessionId,
        onsessioninitialized: (sid) => {
          sessions.set(sid, { transport, srv });
        },
      });

      // Store immediately — don't wait for onsessioninitialized
      sessions.set(newSessionId, { transport, srv });

      await srv.connect(transport);
    }

    await transport.handleRequest(req, res);
  } catch (err) {
    console.error("POST /mcp error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});
app.get("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({ error: "No valid session" });
      return;
    }
    const { transport } = sessions.get(sessionId);
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error("GET /mcp error:", err);
  }
});

app.delete("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"];
    if (!sessionId || !sessions.has(sessionId)) {
      res.status(400).json({ error: "No valid session" });
      return;
    }
    const { transport } = sessions.get(sessionId);
    await transport.handleRequest(req, res);
  } catch (err) {
    console.error("DELETE /mcp error:", err);
  }
});

export default app;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.error(`Onchain Data MCP server listening on port ${PORT}`);
  });
}
