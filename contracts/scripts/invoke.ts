import hre from "hardhat";
import { formatUnits, hexToString } from "viem";
// 0x0ed8db1c8867a2e77d8f25b62cb21723f78839ce
const CONTRACT_ADDRESS = "0xc13dd46cb4301510faaa5d42979e795a325e1165" as `0x${string}`;
const POLL_INTERVAL = 3000;
const TIMEOUT = 300_000;
const SUBCOMMITTEE_SIZE = 3n;
const PRICE_PER_AGENT = BigInt("70000000000000000"); // 0.07 ether

async function main() {
  console.log("╔════════════════════════════════════════════╗");
  console.log("║        Orbit — Ask a Question          ║");
  console.log("╚════════════════════════════════════════════╝\n");

  const query = process.argv[2] || "swap 0.1 stt to wstt" //"get pool for stt and usdc token"//
  console.log(`Query: "${query}"\n`);

  const orbit = await hre.viem.getContractAt("Orbit", CONTRACT_ADDRESS);
  const publicClient = await hre.viem.getPublicClient();

  // Check deposit
  const baseDeposit = await orbit.read.getRequiredDeposit();
  const deposit = baseDeposit + PRICE_PER_AGENT * SUBCOMMITTEE_SIZE;
  const totalNeeded = deposit * BigInt(5);
  console.log(`Required deposit per request: ${formatUnits(deposit, 18)} STT`);
  console.log(`  (base: ${formatUnits(baseDeposit, 18)} + subcommittee: ${formatUnits(PRICE_PER_AGENT * SUBCOMMITTEE_SIZE, 18)})`);
  console.log(`Sending ${formatUnits(totalNeeded, 18)} STT (5x for multi-step)\n`);

  // Send query
  console.log("📡 Sending query to Orbit...");
  const hash = await orbit.write.ask([query], { value: totalNeeded });
  console.log(`Tx: ${hash}\n`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const fromBlock = receipt.blockNumber;

  // Log queryId and requestId from Asked event
  const askedEvents = await orbit.getEvents.Asked({}, { fromBlock, toBlock: fromBlock });
  for (const e of askedEvents) {
    console.log(`🔖 Query ID: ${e.args.queryId}, Request ID: ${e.args.requestId}`);
  }
  console.log(`Confirmed in block ${fromBlock}\n`);

  // Poll for events
  console.log("⏳ Waiting for agent workflow...\n");
  const startTime = Date.now();
  let phase = "selection";

  while (Date.now() - startTime < TIMEOUT) {
    // Check for Answered (final)
    const answeredEvents = await orbit.getEvents.Answered({}, { fromBlock });
    if (answeredEvents.length > 0) {
      for (const event of answeredEvents) {
        const payload = event.args.dashboardPayload!;
        const synthRequestId = event.args.requestId;
        console.log(`\n✅ DASHBOARD READY (synthesis requestId: ${synthRequestId})`);
        try {
          const decoded = JSON.parse(hexToString(payload));
          console.log(JSON.stringify(decoded, null, 2));
        } catch {
          console.log("Raw payload (hex):", payload);
          console.log("Text:", hexToString(payload));
        }
      }
      process.exit(0);
    }

    // Check for errors
    const failEvents = await orbit.getEvents.Failed({}, { fromBlock });
    if (failEvents.length > 0) {
      for (const event of failEvents) {
        console.log(`❌ Failed: ${event.args.reason}`);
      }
      process.exit(1);
    }

    // Print intermediate events
    if (phase === "selection") {
      const toolsChosen = await orbit.getEvents.ToolsChosen({}, { fromBlock });
      if (toolsChosen.length > 0) {
        for (const e of toolsChosen) {
          const selectors = e.args.selectors!.map((s: string) => s.slice(0, 10));
          const ids = e.args.toolCallIds!;
          console.log(`🔧 Tools selected: ${ids.length}`);
          for (let i = 0; i < ids.length; i++) {
            console.log(`   ${i + 1}. ${selectors[i]} (id: ${ids[i]})`);
          }
          console.log();
        }
        phase = "execution";
      }
    }

    if (phase === "execution") {
      const toolDone = await orbit.getEvents.ToolDone({}, { fromBlock });
      if (toolDone.length > 0) {
        // Print any new tool completions we haven't seen
        for (const e of toolDone) {
          const idx = Number(e.args.toolIndex!);
          const id = e.args.toolCallId!;
          console.log(`   ✅ Tool ${idx + 1} complete (${id})`);
        }
      }
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }

  console.log("⏰ Timeout — no response after 5 minutes.");
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
