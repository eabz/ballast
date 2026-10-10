# Parameters

Four numbers decide whether the economics close. None should be guessed; all come from replaying real pool history.

| Parameter | Meaning | Starting range |
| --- | --- | --- |
| k | Ballast rate: share of per-swap loss collected | 0.1 – 0.3 |
| c | Coverage cap: max share of a position's IL reimbursed | 0.3 – 0.5 |
| H | Minimum hold before a claim is valid | 24 – 72 h |
| m | Pro-rata multiplier on a claim's liquidity share | 2 – 5 |

A fifth input, the price reference, is a choice rather than a number: Chainlink feed where one exists, otherwise the pool's own TWAP over a window of at least 30 minutes.

## Backtest plan

Run before any Solidity. Replay ETH/USDC on Base (v4 pool, several months of swaps and liquidity events).

For each candidate k:

1. Compute the reserve accumulated over the replay, swap by swap, using loss = Δy − Δx·P₁.
2. For each closed position, compute realized IL against the reference price at entry and exit.
3. Apply the payout rules under each candidate c, H, m and record the payout.

Report:

- Reserve-to-claims ratio over time.
- Share of losing LPs made whole up to c.
- Effective surcharge as basis points of volume, on median trades and in aggregate.
- Whether splitting positions beats the pro-rata cap at the chosen m.

## Success criterion

The economics close if a k that keeps the surcharge under ~2 bps of volume on median trades funds payouts at c ≥ 0.3.
