import { defineChain } from "viem";
import { createConfig, http } from "wagmi";

export const somnia = defineChain({
  id: 50312,
  name: "Somnia Testnet",
  nativeCurrency: { name: "STT", symbol: "STT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://dream-rpc.somnia.network/"] },
  },
  blockExplorers: {
    default: {
      name: "Shannon Explorer",
      url: "https://shannon-explorer.somnia.network",
    },
  },
});

export const config = createConfig({
  chains: [somnia],
  transports: {
    [somnia.id]: http(),
  },
});
