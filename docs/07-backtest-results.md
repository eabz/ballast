# Backtest results: ETH/USDC 0.05% on Ethereum mainnet

Replay of the Uniswap v4 ETH/USDC 0.05% pool (no hook) on Ethereum mainnet from its initialization on 2025-01-28 to 2026-10-10. The design doc names Base; the archive RPC available was mainnet, and the mainnet pool is deeper with more arbitrage flow, so it is the more demanding test. The engine is chain-agnostic (`backtest/`, see its [README](../backtest/README.md)).

Dataset:

| | |
| --- | --- |
| Period | 621 days |
| Swaps | 1,464,859 |
| Volume | $12.2B |
| Liquidity events | 35,952 (12,358 position closes) |
| LP fees earned | $6.14M |
| Per-swap loss, gross of fee (LVR) | $14.17M |
| Realized IL on losing closes | $14.11M |

Two regimes are reported. **Full** is the whole period. **Mature** skips the first 120 days, when the pool was thin and single trades moved price by double-digit percent; per-swap loss ran at over 100 bps of volume in February 2025 versus about 5 bps once the pool deepened. Decisions below use the mature regime.

Method, in brief: loss per swap is a0·P₁ + a1 from the swapper's deltas, gross of the LP fee. Reference price is a 30-minute geometric TWAP of the pool's own tick path. IL excludes fees. Payouts draw both reserve tokens pro rata by value. Timestamps are interpolated from one sampled block per thousand.

## 1. What the surcharge costs swappers

Mature regime, $11.45B volume, LVR gross $6.48M (5.7 bps of volume), LP fees $5.77M.

| k | Surcharge collected | bps of volume | Median trade bps | p90 trade bps |
| --- | --- | --- | --- | --- |
| 0.1 | $0.65M | 0.57 | 0.08 | 0.38 |
| 0.2 | $1.30M | 1.13 | 0.16 | 0.76 |
| 0.3 | $1.95M | 1.70 | 0.24 | 1.14 |
| 0.5 | $3.24M | 2.83 | 0.40 | 1.90 |
| 0.7 | $4.54M | 3.96 | 0.56 | 2.66 |

The median trade is about $70, so the median-trade criterion in the design doc (under 2 bps) is met at every k tested. The binding constraint is the aggregate: at k = 0.5 the surcharge is 2.8 bps of volume on a 5 bp pool, and the top 1% of swaps pay 64% of it. Those are the arbitrageurs, and at k = 0.7 a p90 trade pays more than half the fee tier again.

Net-of-fee loss (the formula as written in the design doc, with the fee left inside the deltas) is positive on only 4.6% of swaps and collects half as much. The hook should add the fee back, so the surcharge is k times pure price-impact loss.

## 2. What the reserve can pay

The ratio that decides everything is ρ = per-swap loss / realized IL. Over the full period ρ ≈ 1.1. In the mature regime ρ ≈ 0.51: ETH trended (the July to August 2025 rally alone produced $2.5M of claims at c = 0.3), and in a trend LPs realize more IL at close than the swap-by-swap loss, because holding beats rebalancing. The reserve can therefore fund about k × 0.5 of IL in steady state.

Mature regime, H = 24h, m = 3, gross loss. Payout share is dollar-weighted payouts over claims.

| k | c | Reserve / claims | Payout share | Claims paid to c | Any payout | Effective IL repaid |
| --- | --- | --- | --- | --- | --- | --- |
| 0.2 | 0.3 | 0.34 | 34% | 66% | 99% | 10% |
| 0.3 | 0.3 | 0.51 | 44% | 77% | 100% | 13% |
| 0.3 | 0.5 | 0.31 | 31% | 58% | 95% | 15% |
| 0.5 | 0.3 | 0.86 | 64% | 86% | 100% | 19% |
| 0.5 | 0.5 | 0.51 | 44% | 77% | 100% | 22% |
| 0.5 | 1.0 | 0.26 | 26% | 51% | 94% | 26% |
| 0.7 | 0.3 | 1.20 | 83% | 91% | 100% | 25% |
| 0.7 | 0.5 | 0.72 | 56% | 84% | 100% | 28% |
| 0.7 | 1.0 | 0.36 | 35% | 68% | 99% | 35% |

Reading the table: c does not change how much IL comes back in aggregate, only how it is shared. Raising c with a fixed k pays early claimants more and later ones less. The effective repayment is set by k alone, at roughly half of k on this pool. Full funding of c = 0.3 needs k ≈ 0.6.

Full-period numbers are better (k = 0.3, c = 0.3 pays 99% of claims) because the thin launch months collected $1.3M against few closes. They should not be used for sizing.

## 3. H and m

- **H.** Half of all closes happen inside 24 hours and 61% inside 72, but they are small positions: moving H from 24h to 72h cuts eligible claims by only 8.5%. H = 24h is enough for the hold defence; 72h buys little.
- **m.** Higher m lets a large claim take more of the reserve. At k = 0.5, c = 0.3, m from 1 to 10 raises payouts from 54% to 70% of claims but drops the share of eligible closes that get anything from 100% to 87%. m = 3 is the knee: 64% paid, everyone eligible gets something.

## 4. Swap splitting (AV-12)

Measuring loss per unlock instead of per swap keeps 96% of the surcharge today, so routers rarely split within a transaction. Measuring per block keeps 72%: the rest is opposing flow in the same block netting out. Rational splitting is the real threat: 16% of swaps are above $10k, and if those were split into 5 pieces the per-swap surcharge would fall to 24% of today's; into 10 pieces, 15%.

Per-unlock measurement is free and should be the floor. Per-block measurement is immune to same-block splitting at a 28% cost. Splitting across blocks leaves the arbitrageur exposed to competitors between pieces, which is the natural deterrent and cannot be engineered around.

## 5. Salt splitting (AV-07)

No simulation needed. The cap is m × share × reserve and share is linear in liquidity, so n positions of L/n have caps that sum to the single position's cap, and strictly less once earlier payouts shrink the reserve. Splitting only multiplies gas and hold clocks.

## 6. Recommendation for this pool

Decision: k is offered as three tiers the pool creator picks from; c, H and m are fixed. See the tier table in [05-parameters.md](05-parameters.md#tiers).

| Parameter | Value | Why |
| --- | --- | --- |
| k | 0.3 / 0.5 / 0.7 (creator's choice) | 1.7 / 2.8 / 4.0 bps of volume; funds roughly 15% / 22% / 28% of IL. Standard (0.5) is the knee for a 5 bp pool |
| c | 0.5 | One knob for the creator. At c = 0.5, Standard pays 77% of eligible claims in full; c = 0.3 would pay 86% but leave reserve unused in calm periods |
| H | 24 h | 72 h removes only 8.5% of claims |
| m | 3 | Knee between payout share and coverage breadth |
| Loss measure | per unlock, fee added back | 96% of per-swap inflow; closes intra-tx splitting |

Honest framing for LPs: a rebate of roughly a quarter of IL for positions held at least a day, funded by the arbitrageurs who caused it. Not insurance.

## 7. Volatile pairs

Four hookless volatile pools on mainnet v4 were replayed in full to measure ρ where flow is directional. Pools with hooks were excluded because their deltas need not follow vanilla semantics.

| Pool | Fee | History | Swaps | Volume | LVR / fees | Closes | Closes held ≥ 24h | Eligible claims |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| ETH/WEI | 1% | 135 d | 4,466 | 626 ETH | 2.4× | 22 | 0 | none |
| ETH/WCUP | 0.5% | 121 d | 66,780 | 12,861 ETH | 3.5× | 220 | 0 | none |
| ETH/CTM | 0% | 193 d | 571,912 | 142,272 ETH | n/a | 14 | 8 | 0.05 ETH |
| KITE/USDC | 0.01% | 287 d | 284,254 | $125.7M | 180× | 3,546 | 3 | $2.2k |

None of them has the LP population Ballast is for. WEI and WCUP are launch bursts: most volume in the first days, every position closed within hours by snipers and JIT bots. CTM is a zero-fee pool with one protocol-owned position. KITE is a single market-making bot opening and closing per block. ρ cannot be measured on any of them because realized IL is near zero by construction. What they do show:

- **Per-swap loss dwarfs fees on volatile pairs.** LVR ran at 220 to 240 bps of volume on WEI and WCUP against fee tiers of 1% and 0.5%, and at 145 bps on KITE against 1 bp. The surcharge on the median trade at k = 0.3 is 1 to 8 bps, far above ETH/USDC's 0.24 but still small next to the fee tier and the slippage those traders accept.
- **Where to measure ρ.** Memecoin LPs with multi-day holds exist on Base and in v3 pools such as PEPE/WETH 1% on mainnet, which has years of history and thousands of positions. The replay engine needs a v3 event adapter for that (v3 Swap amounts are from the pool's side, and Burn amounts are explicit), plus a Base archive RPC for Base pools.

## 8. Findings for the hook, from the data

- **Pool-draining swaps (AV-14).** Three KITE swaps in one block emptied the active range. The post-swap price became the tick boundary and the loss formula returned 9 × 10²² USDC on a $740k trade. The surcharge must be bounded by the swap's own output; the `afterSwapReturnDelta` limit enforces the ceiling but the computation must not overflow before it. The replay excludes zero-liquidity states.
- **Per-block measurement is manipulable (AV-12).** On WCUP, valuing every swap in a launch block at the end-of-block price reports 53 times the per-swap loss. A sandwich within a block inflates a per-block measure the same way. Per-unlock measurement is immune to this and loses nothing on ETH/USDC.
- **Intra-tx round trips exist (AV-12).** On CTM half of all per-swap loss nets out within the same transaction: multi-leg arbitrage and sandwiches in a zero-fee pool. Per-unlock measurement charges only the net move, which is the right outcome.

## Open items

- Measure ρ on a volatile pair with real LP turnover: a v3 event adapter for PEPE/WETH 1% on mainnet, or a Base archive RPC.
- The reference TWAP is the pool's own; with Chainlink the IL numbers shift slightly, the economics do not.
- Reserve inflow and claims are both concentrated in a few months. A reserve floor or a time-decayed cap would smooth payouts across regimes; not modelled.
