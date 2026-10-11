/**
 * Ballast-rate tiers. The pool creator picks one at hook deployment; k is immutable on-chain.
 * Mirrors K_LIGHT / K_STANDARD / K_HEAVY in src/BallastReserveHook.sol (parts per million).
 *
 * Profile numbers come from the mainnet ETH/USDC 0.05% backtest, mature regime, with the fixed
 * constants c = 0.5, H = 24h, m = 3 (docs/07-backtest-results.md). They scale with the pool: a
 * 1% memecoin pair pays more bps of volume for the same tier.
 */
export type Tier = {
  k: number; // ppm
  name: "Light" | "Standard" | "Heavy";
  /** k as a fraction, e.g. 0.5 */
  rate: number;
  /** Surcharge as bps of total volume on the reference pool. */
  bpsOfVolume: number;
  /** Surcharge on the median trade, bps. */
  medianTradeBps: number;
  /** Surcharge on a 90th-percentile trade, bps. */
  p90TradeBps: number;
  /** Rough share of realized IL the reserve funds in steady state. */
  ilFundedShare: number;
  /** Share of eligible losing positions paid in full up to c. */
  claimsPaidInFull: number;
  blurb: string;
};

export const tiers: readonly Tier[] = [
  {
    k: 300_000,
    name: "Light",
    rate: 0.3,
    bpsOfVolume: 1.7,
    medianTradeBps: 0.24,
    p90TradeBps: 1.1,
    ilFundedShare: 0.15,
    claimsPaidInFull: 0.58,
    blurb: "Lowest surcharge. Best quotes for routers; funds about 15% of LP loss.",
  },
  {
    k: 500_000,
    name: "Standard",
    rate: 0.5,
    bpsOfVolume: 2.8,
    medianTradeBps: 0.4,
    p90TradeBps: 1.9,
    ilFundedShare: 0.22,
    claimsPaidInFull: 0.77,
    blurb: "The knee for a 0.05% pool. Funds about a quarter of LP loss.",
  },
  {
    k: 700_000,
    name: "Heavy",
    rate: 0.7,
    bpsOfVolume: 4.0,
    medianTradeBps: 0.56,
    p90TradeBps: 2.7,
    ilFundedShare: 0.28,
    claimsPaidInFull: 0.84,
    blurb: "Highest rebate. Large trades pay more than half the fee tier again.",
  },
] as const;

/** Fixed rules shared by every tier; mirror the contract constants. */
export const fixedRules = {
  coverageCap: 0.5, // c
  minHoldSeconds: 24 * 3600, // H
  prorataMultiplier: 3, // m
} as const;

export function tierFor(k: number | bigint | undefined): Tier | undefined {
  if (k === undefined) return undefined;
  return tiers.find((t) => t.k === Number(k));
}
