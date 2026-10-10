# Mechanism

Ballast runs two independent lanes. Swaps fund the reserve on every trade. LPs draw from it only when a position closes, and only up to what the reserve holds at that moment.

```mermaid
flowchart LR
    subgraph swap["Swap lane (every swap)"]
        S[Swapper] -->|swap| PM[PoolManager]
        PM -->|afterSwap: loss = Δy − Δx·P₁| H1[BallastReserveHook]
        H1 -->|k · loss| R[(Pool reserve\nERC-6909 claims)]
    end
    subgraph lp["LP lane (position close)"]
        LP[LP] -->|removeLiquidity| PM2[PoolManager]
        PM2 -->|beforeRemoveLiquidity: IL vs hold| H2[BallastReserveHook]
        R -->|min(c·IL, m·share·reserve)| LP
    end
```

## Collection

Each swap pays:

```
surcharge = k · (Δy − Δx · P₁),   0 < k < 1
```

- **k** is the ballast rate. The starting range is 0.1–0.3; the backtest fixes the final value.
- The surcharge is returned as a hook delta from `afterSwap` and minted to the hook as ERC-6909 claims, credited to that pool's reserve.
- It is intended to be taken in the output token, the token LPs are losing. On exact-output swaps v4 only lets the hook charge the input token; see [AV-13](07-attack-vectors.md#av-13-exact-output-swaps).
- It is charged on top of the pool's LP fee and shows up in quotes like any hook fee. LP fees are unaffected.

## Payout

The hook records each position's entry and settles it at exit.

- **Entry** (`afterAddLiquidity`): token amounts deposited, x₀ and y₀, and the reference price Pₑ.
- **Exit** (`beforeRemoveLiquidity`): token amounts coming out, x₁ and y₁, and the reference price Pₓ.

Realized IL, in token1 units:

```
IL = (x₀ · Pₓ + y₀) − (x₁ · Pₓ + y₁)
```

The first term is what the deposit would be worth if it had never been pooled. The second is what the position actually returns. Fees earned are not netted against the claim.

If IL ≤ 0 nothing is paid. Otherwise:

```
payout = min(c · IL, m · liquidityShare · reserve)
```

### Position accounting

- Positions are keyed by (owner, tickLower, tickUpper, salt), the same key as v4.
- A partial removal scales x₀ and y₀ by the fraction withdrawn. The remainder stays on record.
- Adding to an existing position updates the record to a liquidity-weighted average entry.

## Payout rules

The reserve is not a guarantee. These rules keep it solvent and hard to game.

| Rule | Setting | Purpose |
| --- | --- | --- |
| Coverage cap **c** | ≤ 50% of IL | Full coverage cannot be funded. |
| Pro-rata draw **m** | One claim takes at most m × its liquidity share of the reserve. A 2% position with m = 3 can draw up to 6%. | No single exit drains the reserve. |
| Minimum hold **H** | Positions open less than H (e.g. 24h) are not paid. | Blocks short deposit-move-withdraw cycles. |
| Price reference | Chainlink where available, otherwise the pool's TWAP over ≥ 30 min. Pₑ and Pₓ use the same source. | The claimant cannot move the reference price cheaply. |

When the reserve is empty, withdrawals still succeed and pay nothing.

## Ownership

The reserve belongs to the pool. There is no owner and no admin withdrawal. k, c, H, m and the oracle are set when the pool is initialized and cannot change afterwards.
