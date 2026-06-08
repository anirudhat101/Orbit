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

  return srv;
}

const sessions = new Map();

const app = express();
app.use(cors({
  origin: "*",
  methods: "GET,POST,DELETE,OPTIONS",
  exposedHeaders: ["mcp-session-id", "last-event-id", "mcp-protocol-version"],
}));

app.post("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"];
    let transport, srv;
    if (sessionId && sessions.has(sessionId)) {
      ({ transport, srv } = sessions.get(sessionId));
    } else {
      srv = createServer();
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          sessions.set(sid, { transport, srv });
        },
      });
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
