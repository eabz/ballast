# Parameters

Four numbers decide whether the economics work. All four come from replaying real pool history, not from estimates.

| Parameter | Meaning | Starting range |
| --- | --- | --- |
| k | Ballast rate: share of each swap's loss collected | 0.1 – 0.3 |
| c | Coverage cap: max share of a position's IL reimbursed | 0.3 – 0.5 |
| H | Minimum hold before a claim is valid | 24 – 72 h |
| m | Pro-rata multiplier on a claim's liquidity share | 2 – 5 |

The price reference is a choice rather than a number: a Chainlink feed where one exists, otherwise the pool's own TWAP over at least 30 minutes.

## Backtest

Replay several months of swaps and liquidity events from the Base ETH/USDC v4 pool. The code is in `backtest/` ([README](../backtest/README.md)).

For each candidate k:

1. Accumulate the reserve swap by swap using loss = Δy − Δx·P₁.
2. For each closed position, compute realized IL at the entry and exit reference prices.
3. Apply the payout rules under each candidate c, H and m.

Report:

- Reserve-to-claims ratio over time.
- Share of losing LPs paid up to c.
- Surcharge in bps of volume, on median trades and in aggregate.
- Whether splitting a position across salts beats the pro-rata cap ([AV-07](07-attack-vectors.md#av-07-splitting-across-salts)).
- Reserve accrual when arbitrageurs split swaps ([AV-12](07-attack-vectors.md#av-12-swap-splitting)).

## Success criterion

The economics work if some k keeps the surcharge under about 2 bps of volume on median trades and still funds payouts at c ≥ 0.3.
