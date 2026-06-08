import hre from "hardhat";
import { parseEther, formatEther, formatUnits, encodeFunctionData, slice, decodeAbiParameters, toBytes, hexToBytes } from "viem";

const ROUTER = "0xE94de02e52Eaf9F0f6Bf7f16E4927FcBc2c09bC7";
const DEPLOYER = "0x0000000000000000000000000000000000000000";
const USDC = "0xE9CC37904875B459Fa5D0FE37680d36F1ED55e38";
const WSTT = "0x4A3BC48C156384f9564Fd65A53a2f3D534D8f2b7";

const ROUTER_ABI = [
  {
    inputs: [{
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
      name: "params", type: "tuple",
    }],
    name: "exactInputSingle",
    outputs: [{ name: "amountOut", type: "uint256" }],
    stateMutability: "payable",
    type: "function",
  },
] as const;

async function main() {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║     QuickSwap Swap Test (STT → USDC)    ║");
  console.log("╚════════════════════════════════════════════╝\n");

  const publicClient = await hre.viem.getPublicClient();
  const [walletClient] = await hre.viem.getWalletClients();

  const walletAddr = walletClient.account?.address ?? (await walletClient.getAddresses())[0];
  if (!walletAddr) {
    console.error("No wallet account found. Check PRIVATE_KEY in .env");
    process.exit(1);
  }

  const [balanceSTT, balanceUSDC] = await Promise.all([
    publicClient.getBalance({ address: walletAddr }),
    publicClient.readContract({
      address: USDC,
      abi: [{ inputs: [{ name: "owner", type: "address" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" }],
      functionName: "balanceOf",
      args: [walletAddr],
    }),
  ]);
  console.log(`Wallet: ${walletAddr}`);
  console.log(`  STT:  ${formatEther(balanceSTT)}`);
  console.log(`  USDC: ${formatUnits(balanceUSDC as bigint, 6)}\n`);

  const amountIn = parseEther("0.001");
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);

  // Try 1: tokenIn = WSTT (wrapped), send value
  console.log("─── Attempt 1: tokenIn = WSTT, value = amountIn ───");
  try {
    const { request } = await publicClient.simulateContract({
      address: ROUTER,
      abi: ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [{
        tokenIn: WSTT,
        tokenOut: USDC,
        deployer: DEPLOYER,
        recipient: walletAddr,
        deadline,
        amountIn,
        amountOutMinimum: 1n,
        limitSqrtPrice: 0n,
      }],
      value: amountIn,
    });
    console.log("Simulation OK! Sending transaction...");
    const hash = await walletClient.writeContract(request);
    console.log(`Tx: ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`✅ Success! Block: ${receipt.blockNumber}\n`);
    return;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`❌ Failed: ${msg.slice(0, 200)}\n`);
  }

  // Try 2: tokenIn = address(0) (native), send value
  console.log("─── Attempt 2: tokenIn = 0x000..., value = amountIn ───");
  try {
    const { request } = await publicClient.simulateContract({
      address: ROUTER,
      abi: ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [{
        tokenIn: "0x0000000000000000000000000000000000000000",
        tokenOut: USDC,
        deployer: DEPLOYER,
        recipient: walletAddr,
        deadline,
        amountIn,
        amountOutMinimum: 0n,
        limitSqrtPrice: 0n,
      }],
      value: amountIn,
    });
    console.log("Simulation OK! Sending transaction...");
    const hash = await walletClient.writeContract(request);
    console.log(`Tx: ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`✅ Success! Block: ${receipt.blockNumber}\n`);
    return;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`❌ Failed: ${msg.slice(0, 200)}\n`);
  }

  // Check if pool exists
  console.log("─── Checking pool existence ───");
  const DEPLOYER_CONTRACT = "0x0000000000000000000000000000000000000000";
  try {
    const poolFromDeployer = await publicClient.readContract({
      address: DEPLOYER_CONTRACT,
      abi: [{ inputs: [{ name: "token0", type: "address" }, { name: "token1", type: "address" }], name: "pools", outputs: [{ type: "address" }], stateMutability: "view", type: "function" }],
      functionName: "pools",
      args: [WSTT, USDC],
    });
    console.log(`  Pool for (WSTT, USDC): ${poolFromDeployer}`);
    const poolCode = await publicClient.getBytecode({ address: poolFromDeployer as `0x${string}` });
    console.log(`  Pool has code: ${poolCode && poolCode !== "0x" ? "YES" : "NO"}`);
  } catch (err: any) {
    console.log(`  Could not check pool: ${(err.message ?? String(err)).slice(0, 150)}`);
  }

  // Try 3: Simulate with the wallet's actual native STT directly wrapping first
  console.log("─── Attempt 3: Pre-wrap STT → WSTT, then swap ───");
  const WSTT_ABI = [
    { inputs: [{ name: "owner", type: "address" }], name: "balanceOf", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
    { inputs: [], name: "deposit", outputs: [], stateMutability: "payable", type: "function" },
    { inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }], name: "allowance", outputs: [{ type: "uint256" }], stateMutability: "view", type: "function" },
    { inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }], name: "approve", outputs: [{ type: "bool" }], stateMutability: "nonpayable", type: "function" },
  ] as const;

  try {
    const wsttBalance = await publicClient.readContract({
      address: WSTT, abi: WSTT_ABI, functionName: "balanceOf", args: [walletAddr],
    }) as bigint;
    console.log(`  WSTT balance: ${formatEther(wsttBalance)}`);

    if (wsttBalance < amountIn) {
      console.log(`  Wrapping ${formatEther(amountIn)} STT → WSTT...`);
      const wrapHash = await walletClient.writeContract({
        address: WSTT, abi: WSTT_ABI, functionName: "deposit",       value: amountIn,
      });
      await publicClient.waitForTransactionReceipt({ hash: wrapHash });
      console.log(`  Wrap tx: ${wrapHash}`);
    }

    const allowance = await publicClient.readContract({
      address: WSTT, abi: WSTT_ABI, functionName: "allowance", args: [walletAddr, ROUTER],
    }) as bigint;
    if (allowance < amountIn) {
      console.log(`  Approving router to spend WSTT...`);
      const approveHash = await walletClient.writeContract({
        address: WSTT, abi: WSTT_ABI, functionName: "approve", args: [ROUTER, amountIn],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
    }

    const swapCalldata = encodeFunctionData({
      abi: ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [{
        tokenIn: WSTT, tokenOut: USDC, deployer: DEPLOYER,
        recipient: walletAddr, deadline, amountIn,
        amountOutMinimum: 0n, limitSqrtPrice: 0n,
      }],
    });

    // Raw eth_call to capture revert reason
    try {
      await publicClient.call({
        to: ROUTER,
        data: swapCalldata,
        account: walletAddr,
      });
    } catch (callErr: any) {
      const data = callErr?.data ?? callErr?.cause?.data ?? callErr?.details;
      if (data && typeof data === "string" && data.startsWith("0x")) {
        const errorSig = slice(data as `0x${string}`, 0, 4);
        if (errorSig === "0x08c379a0") {
          const reason = decodeAbiParameters(
            [{ type: "string" }],
            slice(data as `0x${string}`, 4)
          )[0];
          throw new Error(`Revert: ${reason}`);
        }
        throw new Error(`Revert raw: ${data.slice(0, 100)}`);
      }
      throw callErr;
    }

    console.log("  Simulation OK! Swapping...");
    const hash = await walletClient.writeContract({
      address: ROUTER, abi: ROUTER_ABI,
      functionName: "exactInputSingle",
      args: [{
        tokenIn: WSTT, tokenOut: USDC, deployer: DEPLOYER,
        recipient: walletAddr, deadline, amountIn,
        amountOutMinimum: 0n, limitSqrtPrice: 0n,
      }],
    });
    console.log(`  Swap tx: ${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`✅ Success! Block: ${receipt.blockNumber}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`❌ All attempts failed: ${msg.slice(0, 500)}`);

    // Try to decode revert reason from raw call error
    if (err && typeof err === "object") {
      const cause = (err as any).cause ?? (err as any).details ?? (err as any).data;
      if (cause) console.log("  Cause:", String(cause).slice(0, 300));
      const shortMsg = (err as any).shortMessage;
      if (shortMsg) console.log("  ShortMsg:", shortMsg);
    }

    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
