# Hook lifecycle

Five callbacks are enabled, which takes six flag bits because `afterSwap` also returns a delta; everything else is off. The flags are declared in `src/BallastReserveHook.sol` and asserted in `test/BallastReserveHook.t.sol`. The swap curve is untouched (`vanillaSwap: true`), which keeps the hook eligible for Uniswap interface routing and simple to audit.

## Permission flags

| Callback | Flag | What Ballast does |
| --- | --- | --- |
| `afterInitialize` | on | Stores the pool's immutable parameters (k, c, H, m, oracle address). Rejects pools whose reference asset has no oracle unless a TWAP fallback is configured. |
| `beforeSwap` | on | Records `sqrtPriceX96` before the swap in transient storage. |
| `afterSwap` + `afterSwapReturnsDelta` | on | Reads the post-swap price, computes loss = Δy − Δx·P₁, returns a delta of k·loss in the output token, mints it as ERC-6909 to the pool's reserve. |
| `afterAddLiquidity` | on | Records or updates the position's entry amounts and entry reference price. |
| `beforeRemoveLiquidity` | on | Computes exit amounts and IL, applies the rules, burns ERC-6909 from the reserve and transfers the payout to the LP. Clears or scales the position record. |

Off: `beforeInitialize`, `beforeAddLiquidity`, `afterRemoveLiquidity`, both donate hooks, `beforeSwapReturnsDelta`, and both liquidity return-delta flags.

## Custody

The hook holds no funds outside the PoolManager. All reserve balances are ERC-6909 claims on the PoolManager, keyed per pool. Payout is a `take` from the PoolManager inside the unlock callback, so standard v4 locking applies.

## Swap flow

1. `beforeSwap`: store pre-swap `sqrtPriceX96` in transient storage.
2. Swap executes on the unmodified curve.
3. `afterSwap`: read post-swap price P₁ and the actual balance deltas Δx, Δy. Compute loss = Δy − Δx·P₁ from the deltas regardless of direction or exact-in/exact-out mode. Return k·loss as a hook delta in the output token and mint it as ERC-6909 to the pool reserve.

## Liquidity flow

1. `afterAddLiquidity`: read the amounts actually deposited and the reference price Pₑ. Create the position record, or fold the new amounts into the existing record as a liquidity-weighted average entry.
2. `beforeRemoveLiquidity`: compute exit amounts x₁, y₁ for the liquidity being removed and read reference price Pₓ. Scale the recorded x₀, y₀ by the fraction withdrawn. Compute IL. If IL > 0, hold ≥ H and the reserve is non-empty, pay min(c·IL, m·share·reserve) from the reserve. Clear the record on full removal, otherwise keep the unscaled remainder.
