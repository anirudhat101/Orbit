import hre from "hardhat";

async function main() {
  console.log("Deploying Orbit to Somnia Testnet...\n");

  const Orbit = await hre.viem.deployContract("Orbit");

  console.log(`✅ Orbit deployed at: ${Orbit.address}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Copy the contract address above`);
  console.log(`  2. Run: npm run invoke:gpt`);
  console.log(`  3. Check on explorer:`);
  console.log(`     https://shannon-explorer.somnia.network/address/${Orbit.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
