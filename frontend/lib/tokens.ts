export type TokenInfo = {
  symbol: string;
  name: string;
  address: `0x${string}`;
  decimals: number;
};

export const NATIVE_STT: `0x${string}` =
  "0x0000000000000000000000000000000000000000";

export const TOKENS: TokenInfo[] = [
  { symbol: "STT", name: "Somnia Token", address: NATIVE_STT, decimals: 18 },
  {
    symbol: "USDC",
    name: "USD Coin",
    address: "0xE9CC37904875B459Fa5D0FE37680d36F1ED55e38",
    decimals: 6,
  },
  {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: "0xd2480162Aa7F02Ead7BF4C127465446150D58452",
    decimals: 18,
  },
  {
    symbol: "WSTT",
    name: "Wrapped STT",
    address: "0x4A3BC48C156384f9564Fd65A53a2f3D534D8f2b7",
    decimals: 18,
  },
];

export function getTokenByAddress(
  address: `0x${string}`
): TokenInfo | undefined {
  return TOKENS.find(
    (t) => t.address.toLowerCase() === address.toLowerCase()
  );
}

export function isNativeToken(address: `0x${string}`): boolean {
  return (
    address.toLowerCase() === NATIVE_STT.toLowerCase() ||
    address === "0x0000000000000000000000000000000000000000"
  );
}
