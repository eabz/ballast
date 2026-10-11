import { formatUnits } from "viem";

export function formatAmount(value: bigint | undefined, decimals: number, maxFraction = 6): string {
  if (value === undefined) return "–";
  return formatNumber(Number(formatUnits(value, decimals)), maxFraction);
}

export function formatNumber(value: number, maxFraction = 6): string {
  if (!Number.isFinite(value)) return "–";
  if (value !== 0 && Math.abs(value) < 10 ** -maxFraction) return `<${10 ** -maxFraction}`;
  return value.toLocaleString("en-US", { maximumFractionDigits: maxFraction });
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** v4 fees are in hundredths of a bip. */
export const formatFee = (fee: number) => `${(fee / 10_000).toFixed(2).replace(/\.?0+$/, "")}%`;
