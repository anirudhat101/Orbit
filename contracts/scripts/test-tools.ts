import hre from "hardhat";
import { formatUnits } from "viem";

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

  // ── 2. Token pairs → pool ──
  console.log("\n─── 2. Factory.poolByPair ───");
  const pairs: [string, string, string][] = [
    ["WSTT→USDC", WSTT, USDC],
    ["WETH→USDC", WETH, USDC],
  ];
  const pools: Record<string, `0x${string}`> = {};
  for (const [label, a, b] of pairs) {
    try {
      const pool = await publicClient.readContract({
        address: FACTORY, abi: FACTORY_ABI, functionName: "poolByPair", args: [a, b],
      }) as `0x${string}`;
      pools[label] = pool;
      const code = await publicClient.getBytecode({ address: pool });
      const ok = code && code !== "0x";
      console.log(`  ${label}: ${pool} → ${ok ? "HAS CODE" : "NO CODE"}`);
      if (ok) pass++; else fail++;
    } catch (e) {
      console.log(`  ${label}: ERROR — ${e instanceof Error ? e.message.slice(0, 120) : e}`);
      fail++;
    }
  }

  // ── 3. Pool state ──
  console.log("\n─── 3. Pool state ───");
  for (const [label, poolAddr] of Object.entries(pools)) {
    if (!poolAddr || poolAddr === NULL) {
      console.log(`  ${label}: SKIP (no pool)`);
      continue;
    }
    // globalState
    try {
      const gs = await publicClient.readContract({
        address: poolAddr, abi: POOL_STATE_ABI, functionName: "globalState", args: [],
      }) as [bigint, number, number, number, number, boolean];
      console.log(`  ${label} globalState:`);
      console.log(`    price: ${gs[0]}`);
      console.log(`    tick:  ${gs[1]}`);
      console.log(`    fee:   ${gs[2]}`);
      pass++;
    } catch (e) {
      console.log(`  ${label} globalState: ERROR — ${e instanceof Error ? e.message.slice(0, 120) : e}`);
      fail++;
    }
    // liquidity
    try {
      const liq = await publicClient.readContract({
        address: poolAddr, abi: POOL_STATE_ABI, functionName: "liquidity", args: [],
      }) as bigint;
      console.log(`  ${label} liquidity: ${liq}`);
      pass++;
    } catch (e) {
      console.log(`  ${label} liquidity: ERROR — ${e instanceof Error ? e.message.slice(0, 120) : e}`);
      fail++;
    }
    // fee
    try {
      const fee = await publicClient.readContract({
        address: poolAddr, abi: POOL_STATE_ABI, functionName: "fee", args: [],
      }) as number;
      console.log(`  ${label} fee: ${fee}`);
      pass++;
    } catch (e) {
      console.log(`  ${label} fee: ERROR — ${e instanceof Error ? e.message.slice(0, 120) : e}`);
      fail++;
    }
    // token0 / token1
    try {
      const [t0, t1] = await Promise.all([
        publicClient.readContract({ address: poolAddr, abi: POOL_STATE_ABI, functionName: "token0", args: [] }),
        publicClient.readContract({ address: poolAddr, abi: POOL_STATE_ABI, functionName: "token1", args: [] }),
      ]);
      console.log(`  ${label} tokens: token0=${t0}, token1=${t1}`);
      pass++;
    } catch (e) {
      console.log(`  ${label} tokens: ERROR — ${e instanceof Error ? e.message.slice(0, 120) : e}`);
      fail++;
    }
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
