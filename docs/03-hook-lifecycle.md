# Hook lifecycle

Five callbacks are enabled. They take six flag bits because `afterSwap` also returns a delta. The flags are declared in `src/BallastReserveHook.sol` and asserted in `test/BallastReserveHook.t.sol`. The swap curve is not modified (`vanillaSwap: true`).

## Permission flags

| Callback | Flag | Behaviour |
| --- | --- | --- |
| `afterInitialize` | on | Store the pool's k, c, H, m and oracle. Reject pools with no oracle and no TWAP fallback. |
| `beforeSwap` | on | Store the pre-swap `sqrtPriceX96` in transient storage. |
| `afterSwap` + `afterSwapReturnsDelta` | on | Compute loss = Δy − Δx·P₁ from the actual deltas, return k·loss as a hook delta and mint it to the pool reserve. |
| `afterAddLiquidity` | on | Create or update the position's entry record (x₀, y₀, Pₑ, entry time). |
| `beforeRemoveLiquidity` | on | Compute IL, apply the payout rules, burn ERC-6909 from the reserve and pay the LP. Scale or clear the record. |

Off: `beforeInitialize`, `beforeAddLiquidity`, `afterRemoveLiquidity`, both donate hooks, `beforeSwapReturnsDelta` and both liquidity return-delta flags.

## Custody

The hook holds no tokens directly. Reserve balances are ERC-6909 claims on the PoolManager, tracked per pool. Payouts are a burn plus `take` inside the PoolManager's unlock callback.

## Swap flow

```mermaid
flowchart TD
    A[Swap submitted] --> B["beforeSwap<br/>store sqrtPriceX96 in transient storage"]
    B --> C["Swap executes on unmodified curve"]
    C --> D["afterSwap<br/>read P₁ and balance deltas Δx, Δy"]
    D --> E["loss = Δy − Δx · P₁"]
    E --> F{loss > 0?}
    F -- no --> G[Return zero delta]
    F -- yes --> H["surcharge = k · loss"]
    H --> I["Return hook delta"]
    I --> J["Mint ERC-6909 to pool reserve"]
    J --> K[Swap settles]
    G --> K
```

The loss is computed from the actual deltas, so swap direction and exact-in or exact-out do not change the formula. The currency charged on exact-output swaps is tracked in [AV-13](07-attack-vectors.md#av-13-exact-output-swaps).

## Payout flow

```mermaid
flowchart TD
    A[removeLiquidity called] --> B["beforeRemoveLiquidity"]
    B --> C["Scale recorded x₀, y₀ by fraction withdrawn"]
    C --> D["Read exit amounts x₁, y₁ and reference price Pₓ"]
    D --> E["IL = (x₀·Pₓ + y₀) − (x₁·Pₓ + y₁)"]
    E --> F{IL > 0?}
    F -- no --> Z[No payout]
    F -- yes --> G{"held ≥ H?"}
    G -- no --> Z
    G -- yes --> H{reserve > 0?}
    H -- no --> Z
    H -- yes --> I["cap = m · liquidityShare · reserve"]
    I --> J["payout = min(c · IL, cap)"]
    J --> K["Burn ERC-6909 from reserve<br/>take to LP inside unlock"]
    K --> L[Update position record]
    Z --> L
    L --> M[Liquidity removal proceeds]
```

Every path ends with the removal going through.

## Position record

```mermaid
flowchart LR
    N[No record] -- "afterAddLiquidity<br/>store x₀, y₀, Pₑ, t₀" --> O[Open record]
    O -- "afterAddLiquidity<br/>liquidity-weighted average entry" --> O
    O -- "beforeRemoveLiquidity (partial)<br/>scale x₀, y₀; keep remainder" --> O
    O -- "beforeRemoveLiquidity (full)<br/>clear" --> N
```
