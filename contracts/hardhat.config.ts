import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-viem";
import "dotenv/config";

const SOMNIA_TESTNET_RPC = process.env.SOMNIA_RPC_TESTNET || "https://dream-rpc.somnia.network/";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    somnia: {
      url: SOMNIA_TESTNET_RPC,
      chainId: 50312,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    hardhat: {
      chainId: 31337,
      forking: {
        url: SOMNIA_TESTNET_RPC,
        enabled: process.env.SOMNIA_RPC_TESTNET ? true : false,
        blockNumber: process.env.FORK_BLOCK ? Number(process.env.FORK_BLOCK) : undefined,
      },
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
  },
  paths: {
    sources: "./contracts",
  },
};

export default config;
