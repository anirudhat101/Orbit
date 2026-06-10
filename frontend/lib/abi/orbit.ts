export const ORBIT_ABI = [
  {
    inputs: [{ name: "nlQuery", internalType: "string", type: "string" }],
    name: "ask",
    outputs: [{ name: "queryId", internalType: "uint256", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [],
    name: "getRequiredDeposit",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "PRICE_PER_AGENT",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "SUBCOMMITTEE_SIZE",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "", internalType: "uint256", type: "uint256" }],
    name: "queries",
    outputs: [
      { internalType: "address", name: "user", type: "address" },
      { internalType: "string", name: "nlQuery", type: "string" },
      { internalType: "uint8", name: "phase", type: "uint8" },
      { internalType: "uint256", name: "pendingCount", type: "uint256" },
      { internalType: "uint256", name: "budget", type: "uint256" },
      { internalType: "bytes", name: "dashboardPayload", type: "bytes" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "queryId", type: "uint256" },
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "nlQuery", type: "string" },
      { indexed: false, name: "requestId", type: "uint256" },
    ],
    name: "Asked",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "queryId", type: "uint256" },
      { indexed: false, name: "dashboardPayload", type: "bytes" },
      { indexed: false, name: "requestId", type: "uint256" },
    ],
    name: "Answered",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "queryId", type: "uint256" },
      { indexed: false, name: "reason", type: "string" },
    ],
    name: "Failed",
    type: "event",
  },
] as const;
