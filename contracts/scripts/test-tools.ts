import hre from "hardhat";
import { formatUnits, keccak256, toHex, slice, encodeAbiParameters, parseAbiParameters } from "viem";

const FACTORY = "0x13fa49215C180Acce0f5EEcB7d4900987d407930";
const ROUTER  = "0xE94de02e52Eaf9F0f6Bf7f16E4927FcBc2c09bC7";
const USDC    = "0xE9CC37904875B459Fa5D0FE37680d36F1ED55e38";
const WETH    = "0xd2480162Aa7F02Ead7BF4C127465446150D58452";
const WSTT    = "0x4A3BC48C156384f9564Fd65A53a2f3D534D8f2b7";
const NULL    = "0x0000000000000000000000000000000000000000";

const ERC20_BALANCE = [
  { inputs: [{ name: "owner", type: "address" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
] as const;

const FACTORY_ABI = [
  { inputs: [{ name: "tokenA", type: "address" }, { name: "tokenB", type: "address" }], name: "poolByPair", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
] as const;

const POOL_STATE_ABI = [
  { inputs: [], name: "globalState", outputs: [{ name: "price", type: "uint160" }, { name: "tick", type: "int24" }, { name: "lastFee", type: "uint16" }, { name: "pluginConfig", type: "uint8" }, { name: "communityFee", type: "uint16" }, { name: "unlocked", type: "bool" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "liquidity", outputs: [{ type: "uint128" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "fee", outputs: [{ type: "uint16" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "token0", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
  { inputs: [], name: "token1", outputs: [{ type: "address" }], stateMutability: "view", type: "function" },
] as const;

async function main() {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║     Onchain Tool Execution Test         ║");
  console.log("╚════════════════════════════════════════════╝\n");

  const publicClient = await hre.viem.getPublicClient();
  let pass = 0, fail = 0;

  // ── 1. Check addresses have code ──
  console.log("─── 1. Contract presence ───");
  for (const [label, addr] of [["Factory", FACTORY], ["Router", ROUTER], ["USDC", USDC], ["WETH", WETH], ["WSTT", WSTT]] as const) {
    const code = await publicClient.getBytecode({ address: addr });
    const ok = code && code !== "0x";
    console.log(`  ${label}: ${addr} → ${ok ? "OK" : "NO CODE"}`);
    if (ok) pass++; else fail++;
  }

  // ── 2. Probe factory functions ──
  console.log("\n─── 2. Probing factory selectors ───");
  const SELECTORS = [
    { sig: "poolByPair(address,address)", name: "poolByPair" },
    { sig: "pools(address,address)", name: "pools" },
    { sig: "getPool(address,address)", name: "getPool" },
    { sig: "pool(address,address)", name: "pool" },
    { sig: "poolByPair(address,address,address)", name: "poolByPair3" },
    { sig: "poolForPair(address,address)", name: "poolForPair" },
  ];
  for (const { sig, name } of SELECTORS) {
    const selector = slice(keccak256(toHex(sig)), 0, 4);
    const encodedArgs = encodeAbiParameters(
      parseAbiParameters("address, address"),
      [WSTT, USDC]
    );
    const data = (selector + encodedArgs.slice(2)) as `0x${string}`;
    try {
      const result = await publicClient.call({ to: FACTORY, data });
      const pool = result.data && result.data !== "0x" ? result.data : NULL;
      console.log(`  ${name}: selector=${selector} → pool=${pool}`);
      pass++;
    } catch (e) {
      const msg = e instanceof Error ? e.message.slice(0, 100) : String(e);
      console.log(`  ${name}: selector=${selector} → REVERT (${msg})`);
      fail++;
    }
  }

  // ── 3. Direct pool state (known pool from earlier tests) ──
  console.log("\n─── 3. Direct pool state ───");
  const KNOWN_POOL = "0xdc62e02e46CF247582FaC404b18580a46756C1C6";
  const code = await publicClient.getBytecode({ address: KNOWN_POOL });
  console.log(`  Known pool ${KNOWN_POOL} has code: ${code && code !== "0x" ? "YES" : "NO"}`);
  if (code && code !== "0x") {
    pass++;
    for (const method of ["globalState", "liquidity", "fee", "token0", "token1"] as const) {
      try {
        const r = await publicClient.readContract({ address: KNOWN_POOL, abi: POOL_STATE_ABI, functionName: method, args: [] });
        console.log(`  ${method}: ${JSON.stringify(r)}`);
        pass++;
      } catch (e) {
        console.log(`  ${method}: ERROR — ${e instanceof Error ? e.message.slice(0, 120) : e}`);
        fail++;
      }
    }
  } else {
    fail++;
  }

  // ── 4. ERC20 balances (for resolveToken sanity check) ──
  console.log("\n─── 4. Token address resolution ───");
  const [walletClient] = await hre.viem.getWalletClients();
  const walletAddr = walletClient.account?.address ?? (await walletClient.getAddresses())[0];
  try {
    const [usdcBal, wethBal, wsttBal] = await Promise.all([
      publicClient.readContract({ address: USDC, abi: ERC20_BALANCE, functionName: "balanceOf", args: [walletAddr] }),
      publicClient.readContract({ address: WETH, abi: ERC20_BALANCE, functionName: "balanceOf", args: [walletAddr] }),
      publicClient.readContract({ address: WSTT, abi: ERC20_BALANCE, functionName: "balanceOf", args: [walletAddr] }),
    ]);
    console.log(`  USDC:  ${formatUnits(usdcBal as bigint, 6)}`);
    console.log(`  WETH:  ${formatUnits(wethBal as bigint, 18)}`);
    console.log(`  WSTT:  ${formatUnits(wsttBal as bigint, 18)}`);
    pass++;
  } catch (e) {
    console.log(`  ERROR: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
    fail++;
  }

  // ── 5. Router has code check ──
  console.log("\n─── 5. Router readiness ───");
  const routerCode = await publicClient.getBytecode({ address: ROUTER });
  console.log(`  Router ${ROUTER}: ${routerCode && routerCode !== "0x" ? "OK" : "NO CODE"}`);
  if (routerCode && routerCode !== "0x") pass++; else fail++;

  // ── Summary ──
  console.log(`\n╔════════════════════════════════════════════╗`);
  console.log(`║  PASS: ${pass}  FAIL: ${fail}                        ║`);
  console.log(`╚════════════════════════════════════════════╝`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
