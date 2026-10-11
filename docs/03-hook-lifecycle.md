# Hook lifecycle

Five callbacks are enabled. They take seven flag bits because `afterSwap` and `afterRemoveLiquidity` also return deltas. The flags are declared in `src/BallastReserveHook.sol` and asserted in `test/BallastReserveHook.t.sol`. The swap curve is not modified (`vanillaSwap: true`).

Each deployment serves exactly one pool. The PoolKey, k, c, H, m and the oracle settings are constructor immutables.

## Permission flags

| Callback | Flag | Behaviour |
| --- | --- | --- |
| `afterInitialize` | on | Revert with `PoolNotAllowed` unless the PoolKey matches the constructor's. Seed the first TWAP observation. |
| `beforeSwap` | on | Store the pre-swap `sqrtPriceX96`. On the first swap of a block, write a TWAP observation. |
| `afterSwap` + `afterSwapReturnsDelta` | on | Compute the loss from the actual deltas, return k·loss as a hook delta in the unspecified currency and mint it to the reserve. |
| `afterAddLiquidity` | on | Create or update the position record (liquidity, Pₑ, entry time) and the running totals used for the pro-rata share. |
| `afterRemoveLiquidity` + `afterRemoveLiquidityReturnsDelta` | on | Compute IL for the removed liquidity, apply the payout rules, burn ERC-6909 from the reserve and return the payout as a hook delta credited to the caller. Scale or clear the record. |

Off: `beforeInitialize`, `beforeAddLiquidity`, `beforeRemoveLiquidity`, both donate hooks, `beforeSwapReturnsDelta` and `afterAddLiquidityReturnsDelta`.

## Custody

Reserve balances are ERC-6909 claims on the PoolManager. See [Security](04-security.md#custody).

## Swap flow

```mermaid
flowchart TD
    A[Swap submitted] --> B["beforeSwap<br/>store sqrtPriceX96;<br/>first swap in block: write TWAP observation"]
    B --> C["Swap executes on unmodified curve"]
    C --> D["afterSwap<br/>read P₁ and balance deltas Δx, Δy"]
    D --> E["loss = Δy − Δx · P₁"]
    E --> F{loss > 0?}
    F -- no --> G[Return zero delta]
    F -- yes --> H["surcharge = k · loss"]
    H --> I["Return hook delta<br/>in unspecified currency"]
    I --> J["Mint ERC-6909 to reserve"]
    J --> K[Swap settles]
    G --> K
```

The charged currency is the output token on exact-in swaps and the input token on exact-out swaps, converted at P₁. This flow is per swap; moving to a per-block measure ([AV-28](06-attack-vectors.md#av-28-per-swap-loss-over-counts-in-block-round-trips)) will change it.

## Payout flow

```mermaid
flowchart TD
    A["modifyLiquidity, delta ≤ 0"] --> B["afterRemoveLiquidity"]
    B --> Q{"liquidityDelta < 0?"}
    Q -- no --> M
    Q -- yes --> D["Read Pₓ<br/>Chainlink, else TWAP"]
    D --> D2{reference usable?}
    D2 -- no --> Z[No payout]
    D2 -- yes --> E["x₀, y₀ at Pₑ and x₁, y₁ at Pₓ<br/>from removed liquidity and range<br/>IL = (x₀·Pₓ + y₀) − (x₁·Pₓ + y₁)"]
    E --> F{IL > 0?}
    F -- no --> Z
    F -- yes --> G{"held ≥ H?"}
    G -- no --> Z
    G -- yes --> H{reserve > 0?}
    H -- no --> Z
    H -- yes --> I["share = hold value at Pₓ<br/>÷ total hold value at Pₓ<br/>cap = m · share · reserve"]
    I --> J["payout = min(c · IL, cap)"]
    J --> K["Burn ERC-6909 from reserve<br/>return payout as hook delta to caller"]
    K --> L[Update position record and totals]
    Z --> L
    L --> M[Liquidity removal proceeds]
```

Every path ends with the removal going through. "Reference usable" means Chainlink is fresh and valid or the TWAP is available, and the two agree within the deviation bound when both exist.

## Position record

```mermaid
flowchart LR
    N[No record] -- "afterAddLiquidity<br/>store L, Pₑ, t₀" --> O[Open record]
    O -- "afterAddLiquidity<br/>liquidity-weighted Pₑ and t₀" --> O2[Open record, updated]
    O2 -. same state .-> O
    O -- "afterRemoveLiquidity (partial)<br/>settle removed L; keep remainder" --> P[Open record, reduced]
    P -. same state .-> O
    O -- "afterRemoveLiquidity (full)<br/>settle and clear" --> N
```

Dotted edges mark the same state drawn twice for readability. Key: (owner, tickLower, tickUpper, salt).
