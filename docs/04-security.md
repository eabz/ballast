# Security

## Trust model

- No owner, no upgrade path, no pause. If a flaw is found, the remedy is a new hook and LP migration, not an admin key.
- No admin withdrawal. The reserve belongs to the pool.
- Parameters are immutable per pool after `afterInitialize`.
- The hook never blocks liquidity removal. Worst case for an LP is a payout of zero.
- The hook makes no external calls to the LP during payout and executes no swaps.

## Attack surface

| Attack | Defense |
| --- | --- |
| Deposit, move the price, withdraw and claim IL | Minimum hold H; long-window or external reference price; pro-rata draw cap. Moving a 30-minute TWAP on a liquid pair costs more than the capped claim. |
| Wash-trade to look like a loser | IL is measured against the reference price, not against the LP's own trades. Wash trades pay the surcharge and move nothing that matters. |
| Split one position into many to beat the pro-rata cap | The cap is per claim but the multiplier m bounds total draw; many small positions each hold for H and each pay gas. Monitor in backtest; raise H or lower m if it is profitable. |
| Sandwich the reference price at the exact block of withdrawal | External oracle, or TWAP window ≫ one block. |
| Reserve-token mismatch: reserve holds token A, claimant is owed value in token B | Payout is denominated in value (token1 units) and paid in whatever mix the reserve holds, at the reference price. No swap is executed by the hook. |
| Drain via reentrancy during payout | Payout is a `take` from the PoolManager inside the unlock callback; standard v4 locking applies, no external calls to the LP. |
| Router or aggregator exploits the surcharge formula with exact-output swaps | Exact-output swaps are handled by computing the loss term from the actual deltas regardless of direction; tested both ways. |

## Open questions to settle before audit

- Oracle failure modes: stale Chainlink round, TWAP observation cardinality too low. The design says reject at init without an oracle or TWAP fallback; behaviour at withdrawal when the feed is stale is not yet specified.
- Rounding direction for the surcharge and the payout. Both should round in favour of the reserve.
- Whether position split across many salts can beat m in practice. To be measured in the backtest.
