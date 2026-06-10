const RATES: Record<string, Record<string, number>> = {
  STT: { USDC: 0.1177, WETH: 0.000007058 },
  USDC: { STT: 1 / 0.1177, WETH: 0.00006714 },
  WETH: { STT: 1 / 0.000007058, USDC: 1 / 0.00006714 },
};

export function calculateAmountOut(
  amountIn: string,
  decimalsIn: number,
  decimalsOut: number,
  symbolIn: string,
  symbolOut: string
): number {
  const inVal =
    amountIn.includes(".") ? Number(amountIn) : Number(amountIn) / 10 ** decimalsIn;
  if (inVal === 0 || symbolIn === symbolOut) return 0;

  const rate = RATES[symbolIn]?.[symbolOut];
  if (rate == null) return 0;

  const outVal = inVal * rate;
  return outVal;
}
