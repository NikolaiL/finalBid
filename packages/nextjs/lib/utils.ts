const DISPLAY_DECIMALS = Number(process.env.NEXT_PUBLIC_DISPLAY_DECIMALS) ?? 2;
const TOKEN_DECIMALS = Number(process.env.NEXT_PUBLIC_TOKEN_DECIMALS) ?? 18;

export function formatToken(amount: string | bigint, decimals: number = DISPLAY_DECIMALS): string {
  const amountNumber = Number(amount);
  const tokenAmount = amountNumber / 10 ** TOKEN_DECIMALS;
  return tokenAmount.toFixed(decimals);
}
