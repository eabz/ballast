# Attack vectors

Known ways to drain, misdirect or break `BallastReserveHook`. Each entry describes the attack, the defense the current design offers (if any), and the checks that close it. Work through this list before audit, and add new vectors here as they come up.

Severity:

- **Critical**: drains or misroutes the reserve, or blocks withdrawals.
- **High**: breaks an economic assumption.
- **Medium**: profitable under some parameters, or a revert path.
- **Low**: griefing or degraded routing.

Status: `open`, `design-fix`, `test-written`, `mitigated`, `accepted`. A vector is closed when a test reproduces the attack and passes against the mitigation, or when it is `accepted` with a stated reason.

## Summary

| ID | Vector | Area | Severity | Status |
| --- | --- | --- | --- | --- |
| AV-01 | Zero-delta `modifyLiquidity` triggers a claim | Payout | Critical | open |
| AV-02 | Spot vs Pₓ mismatch at exit or entry | Payout | Critical | design-fix |
| AV-03 | Payout recipient is the router or PositionManager | Payout | Critical | design-fix |
| AV-04 | Deposit, move the reference price, withdraw and claim | Payout | High | open |
| AV-05 | Hold timer bypass by topping up an aged position | Payout | High | design-fix |
| AV-06 | Pro-rata share measured in liquidity units | Payout | High | design-fix |
| AV-07 | Splitting a position across salts | Payout | Medium | open |
| AV-08 | Partial-removal rounding and record drift | Payout | Medium | open |
| AV-09 | Narrow range at a TWAP push target | Payout | Medium | open |
| AV-10 | Payout token mix against a skewed Pₓ | Payout | Medium | open |
| AV-11 | Wash trading to appear as a losing LP | Payout | Low | open |
| AV-12 | Surcharge evasion by splitting swaps | Collection | High | design-fix |
| AV-13 | Exact-output swaps and the charged currency | Collection | High | design-fix |
| AV-14 | Surcharge arithmetic | Collection | Medium | open |
| AV-15 | TWAP fallback not provided by v4 core | Oracle | High | design-fix |
| AV-16 | Same-block manipulation of the reference price | Oracle | High | open |
| AV-17 | Oracle failure blocks withdrawals | Oracle | High | open |
| AV-18 | Cross-pool drain through shared ERC-6909 balances | Accounting | Critical | open |
| AV-19 | Per-pool parameters set by the initializer | Accounting | Critical | design-fix |
| AV-20 | Reentrancy during payout | Accounting | Medium | open |
| AV-21 | Unsettled hook delta | Accounting | Medium | open |
| AV-22 | Native ETH paths | Accounting | Medium | open |
| AV-23 | Fee-on-transfer and rebasing tokens | Accounting | Medium | open |
| AV-24 | Callbacks reachable outside the PoolManager | Access | Medium | open |
| AV-25 | Front-running large exits | Economic | Low | open |
| AV-26 | Pool unroutable against an unhooked pool | Economic | Low | open |
| AV-27 | JIT liquidity and the pro-rata denominator | Economic | Low | open |

## Payout

### AV-01 Zero-delta `modifyLiquidity` triggers a claim

- **Attack**: v4 sends `modifyLiquidity` calls with `liquidityDelta == 0` (used to collect fees) through the remove path, so `beforeRemoveLiquidity` runs. If the hook settles a claim without checking the delta, every such call pays out again.
- **Defense**: none.
- **Check**
  - [ ] Test: losing position held past H, repeated zero-delta calls. Reserve unchanged.
  - [ ] `_beforeRemoveLiquidity` returns early when `liquidityDelta >= 0`.

### AV-02 Spot vs Pₓ mismatch

- **Attack**: the exit amounts x₁, y₁ depend on the pool's spot price, but IL values them at the reference price Pₓ. Within one unlock, the attacker swaps spot away from Pₓ, removes liquidity, and swaps back. Valued at Pₓ, the position looks like a large loser even though Pₓ never moved. The same trick at entry inflates x₀, y₀. It pays when c × the inflated IL exceeds the round-trip swap cost.
- **Defense**: none.
- **Check**
  - [ ] Test: flash-swap → remove → swap back across position widths and pool depths. Claim vs round-trip cost.
  - [ ] Design: derive x₁, y₁ (and x₀, y₀) from liquidity at Pₓ (Pₑ), or reject claims when |spot − Pₓ| exceeds a bound.

### AV-03 Payout recipient

- **Attack**: the `sender` the hook sees is the contract that called the PoolManager, not the LP. Through PositionManager it is PositionManager itself, with `salt = tokenId`. A payout sent to `sender` is stuck there, or goes to whoever controls a custom router. Position NFTs can also be transferred, so the current holder may not be the original depositor.
- **Defense**: none.
- **Check**
  - [ ] Test: claims through PositionManager and a custom router. Trace the tokens.
  - [ ] Design: pick a recipient. Options are a credit on the caller's delta (needs `afterRemoveLiquidityReturnDelta`) or an allowlist of position managers that resolve the tokenId owner.

### AV-04 Deposit, move the reference price, withdraw

- **Attack**: deposit, move Pₓ, withdraw and claim.
- **Defense**: minimum hold H, Chainlink or ≥ 30 min TWAP, pro-rata cap.
- **Check**
  - [ ] Test: claim inside H pays zero.
  - [ ] Simulation: cost to move the reference price vs the capped claim, at backtest depths.

### AV-05 Hold timer bypass

- **Attack**: open a dust position, wait H, add a large amount to the same key, claim.
- **Defense**: none. The weighted-average entry covers x₀, y₀ and Pₑ, not the entry time.
- **Check**
  - [ ] Test: dust at t₀, top-up at t₀ + H, claim one block later. Payout zero or limited to the dust.
  - [ ] Design: liquidity-weight the entry time, or track hold per tranche.

### AV-06 Pro-rata share in liquidity units

- **Attack**: liquidity units do not compare across ranges. A one-tick position has far more L per dollar than a full-range one, so it gets a far larger share. If the denominator is in-range liquidity, the attacker can also push spot into a thinly covered region where their position dominates. Either way m × share can approach the whole reserve.
- **Defense**: none.
- **Check**
  - [ ] Test: one-tick vs full-range position of equal value. Compare caps.
  - [ ] Test: spot pushed into thin liquidity before the claim.
  - [ ] Design: share by value at Pₓ over pool TVL at Pₓ, or a time-averaged denominator.

### AV-07 Splitting across salts

- **Attack**: N positions held for H, each capped at m × its own share.
- **Defense**: H per position, gas per position.
- **Check**
  - [ ] Test and backtest: one position vs N salts of equal total value, net of Base gas.

### AV-08 Partial-removal rounding

- **Attack**: many small removals rounding in the claimant's favour, or x₀, y₀ scaling that drifts upward.
- **Defense**: none.
- **Check**
  - [ ] Fuzz: sum of N partial claims ≤ one full claim; record ends at zero.
  - [ ] Payout rounds down; record scaling rounds against the claimant.

### AV-09 Narrow range at a TWAP push target

- **Attack**: narrow position at the tick the TWAP will be pushed to, held for H, TWAP held there for the window.
- **Defense**: TWAP window ≥ 30 min.
- **Check**
  - [ ] Simulation: cost to hold the price for the window vs the claim, at backtest depths.

### AV-10 Payout token mix

- **Attack**: reserve holds both tokens; payout is valued at Pₓ. With Pₓ off market, the claimant takes the undervalued token.
- **Defense**: payout denominated in token1 value, paid in the reserve's mix at Pₓ; no swap.
- **Check**
  - [ ] Design: fixed mix rule (for example token1 first).
  - [ ] Test: Pₓ skewed ±5% from spot.

### AV-11 Wash trading

- **Attack**: wash trade to make a position look like a loser.
- **Defense**: IL is measured at Pₓ, not against the LP's trades. Wash trades pay the surcharge.
- **Check**
  - [ ] Test: wash trades between entry and exit leave the claim unchanged and grow the reserve.

## Collection

### AV-12 Swap splitting

- **Attack**: per-swap loss grows roughly with the square of trade size. An arbitrageur who splits one swap into N smaller swaps to the same final price pays about 1/N of the surcharge. All N fit in a single unlock, and gas on Base is cheap. This undercuts the flow the reserve relies on.
- **Defense**: none.
- **Check**
  - [ ] Test: one swap vs N swaps in one unlock to the same price. Compare total surcharge.
  - [ ] Backtest: reserve accrual under rational splitting.
  - [ ] Design: measure loss per unlock or per block from a stored start price.

### AV-13 Exact-output swaps

- **Attack**: `afterSwapReturnDelta` applies only to the unspecified currency. On exact-output swaps that is the input token; the output token cannot be charged.
- **Defense**: loss computed from actual deltas in both directions. Does not cover the charged currency.
- **Check**
  - [ ] Tests: zeroForOne × exactIn/exactOut. Assert charged currency, delta sign, amount in token1 value.
  - [ ] Design: charge the input token on exact-output swaps, converted at P₁.

### AV-14 Surcharge arithmetic

- **Check**
  - [ ] `sqrtPriceX96²` through `FullMath.mulDiv`.
  - [ ] Decimals: USDC 6 / WETH 18, and a pair with token0 decimals > token1 decimals.
  - [ ] Returned delta fits int128 and never exceeds the unspecified amount.
  - [ ] Fuzz: loss ≥ 0 both directions; surcharge rounds toward the reserve.

## Oracle

### AV-15 TWAP fallback

- **Attack**: v4 core keeps no price observations, so a TWAP fallback has to be built and stored by the hook. On new or thin pools it is cheap to move, and with a single sequencer on Base, holding a price across several blocks is realistic.
- **Defense**: none.
- **Check**
  - [ ] Design: Chainlink-only pools, or specify observation storage, cardinality, window and minimum depth.
  - [ ] Simulation: cost to move the TWAP by X% over the window.

### AV-16 Same-block reference manipulation

- **Attack**: sandwich the reference price in the withdrawal block.
- **Defense**: external oracle, or TWAP window much longer than one block.
- **Check**
  - [ ] Test: swaps in the same block as the claim leave Pₓ unchanged.

### AV-17 Oracle failure blocks withdrawals

- **Attack**: the feed reverts, is stale, returns zero or a negative value, or the L2 sequencer is down. If the hook reverts on any of these, every removal reverts and LP funds are locked until the feed recovers.
- **Defense**: none.
- **Check**
  - [ ] Oracle read in try/catch; any failure means payout 0 and the removal proceeds.
  - [ ] Tests: reverting feed, stale `updatedAt`, `answer <= 0`, sequencer down, grace period, decimals ≠ 8.

## Accounting and access

### AV-18 Cross-pool drain

- **Attack**: the hook's ERC-6909 balance on the PoolManager is per currency, not per pool. Anyone can initialize a pool on the hook, for example ETH/ScamToken. If per-pool accounting is wrong, claims in that pool are paid from ETH collected by a legitimate pool.
- **Defense**: none.
- **Check**
  - [ ] Invariant: per currency, Σ pool reserves ≤ hook ERC-6909 balance; no payout exceeds its pool's reserve.
  - [ ] Test: two pools sharing ETH; draining one leaves the other unchanged.

### AV-19 Initializer-set parameters

- **Attack**: `afterInitialize` receives no hookData, so the design does not yet say where per-pool parameters come from. If the initializer can choose them, an attacker initializes a pool with a false oracle and claims fake IL. Combined with AV-18, that drains other pools.
- **Defense**: none.
- **Check**
  - [ ] Design: parameters from constructor constants or a fixed table keyed by currency pair.
  - [ ] Test: initialize with an arbitrary oracle; rejected or ignored.

### AV-20 Reentrancy during payout

- **Attack**: reenter the hook or PoolManager during payout.
- **Defense**: payout is a `take` inside the unlock; no external calls to the LP.
- **Check**
  - [ ] Test: ETH recipient contract and a callback token reentering on receipt.

### AV-21 Unsettled hook delta

- **Attack**: a branch leaves the hook with a non-zero delta; the unlock reverts with `CurrencyNotSettled`.
- **Check**
  - [ ] Tests: every branch of `_afterSwap` and `_beforeRemoveLiquidity` (zero surcharge, empty reserve, partial reserve) settles.

### AV-22 Native ETH

- **Check**
  - [ ] `currency0 = address(0)`: surcharge mint, payout burn and take, ETH delivery.

### AV-23 Fee-on-transfer and rebasing tokens

- **Check**
  - [ ] Decide: reject at `afterInitialize`, or rely on AV-18 isolation.

### AV-24 Callbacks outside the PoolManager

- **Check**
  - [ ] Test: every external hook entrypoint called from an EOA reverts.

## Economic

### AV-25 Front-running exits

- **Attack**: claim ahead of large exits to empty the reserve.
- **Check**
  - [ ] Backtest: payout distribution under adversarial ordering. Decide whether `accepted`.

### AV-26 Unroutable pool

- **Attack**: surcharge makes quotes worse than an unhooked pool; routers skip it.
- **Check**
  - [ ] Backtest: surcharge in bps of median trade vs the ~2 bps target.

### AV-27 JIT liquidity

- **Attack**: JIT liquidity around a claim changes the pro-rata denominator.
- **Check**
  - [ ] Test after AV-06 is resolved: JIT add before a claim, remove after.
