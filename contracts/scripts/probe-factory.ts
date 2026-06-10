import hre from "hardhat";
import { toHex, pad, slice } from "viem";

const FACTORY = "0x13fa49215C180Acce0f5EEcB7d4900987d407930";
const WSTT = "0x4A3BC48C156384f9564Fd65A53a2f3D534D8f2b7";
const USDC = "0xE9CC37904875B459Fa5D0FE37680d36F1ED55e38";

// Try different possible pool lookup function signatures
const SELECTORS = [
  { sig: "poolByPair(address,address)", name: "poolByPair" },
  { sig: "pools(address,address)", name: "pools" },
  { sig: "getPool(address,address)", name: "getPool" },
  { sig: "pool(address,address)", name: "pool" },
];

function encodeSelector(sig: string): `0x${string}` {
  const encoder = new TextEncoder();
  const hash = crypto.subtle ? null : null; // fallback
  return `0x${sig}`; // placeholder, we compute below
}

import { keccak256, encodeAbiParameters, parseAbiParameters } from "viem";

async function main() {
  const publicClient = await hre.viem.getPublicClient();

  console.log("Probing factory at", FACTORY, "\n");

  for (const { sig, name } of SELECTORS) {
    const selector = slice(keccak256(toHex(sig)), 0, 4);
    const encodedArgs = encodeAbiParameters(
      parseAbiParameters("address, address"),
      [WSTT, USDC]
    );
    const data = (selector + encodedArgs.slice(2)) as `0x${string}`;

    try {
      const result = await publicClient.call({
        to: FACTORY,
        data,
      });
      console.log(`  ✅ ${name}(${sig}): ${result.data}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 120) : String(e);
      console.log(`  ❌ ${name}(${sig}): ${msg}`);
    }
  }
}

main().catch(console.error);
