import hre from "hardhat";

async function main() {
  console.log("Deploying Dex and Orbit to Somnia Testnet...\n");

  // const Dex = await hre.viem.deployContract("Dex");
  // console.log(`✅ Dex deployed at: ${Dex.address}`);
  const dexAddress = "0x17704ebb1714c1291f8214dd61fe1f3b1cd2e0f9" // Dex.address
  const Orbit = await hre.viem.deployContract("Orbit", [dexAddress]);
  console.log(`✅ Orbit deployed at: ${Orbit.address}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Copy the contract addresses above`);
  console.log(`  2. Run: npm run invoke:gpt`);
  console.log(`  3. Check on explorer:`);
  console.log(`     https://shannon-explorer.somnia.network/address/${Orbit.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
