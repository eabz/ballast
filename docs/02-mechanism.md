# Mechanism

Ballast has two lanes that never meet at swap time. The swap lane funds the reserve on every swap. The LP lane draws from the reserve only when a position closes, and only from what the reserve holds at that moment.

```mermaid
flowchart LR
    subgraph swap["Swap lane (every swap)"]
        S[Swapper] -->|swap| PM[PoolManager]
        PM -->|afterSwap: loss = Δy − Δx·P₁| H1[BallastReserveHook]
        H1 -->|k · loss, output token| R[(Pool reserve\nERC-6909 claims)]
    end
    subgraph lp["LP lane (position close)"]
        LP[LP] -->|removeLiquidity| PM2[PoolManager]
        PM2 -->|beforeRemoveLiquidity: IL vs hold| H2[BallastReserveHook]
        R -->|min(c·IL, m·share·reserve)| LP
    end
```

## Collection: the per-swap surcharge

Every swap pays a surcharge proportional to the loss it imposes, not a flat rate:

```
surcharge = k · (Δy − Δx · P₁),   0 < k < 1
```

k is the **ballast rate**. Noise trades with tiny price impact pay almost nothing; large price-moving trades, which are disproportionately informed or arbitrage flow, fund most of the reserve. A starting range for k is 0.1 to 0.3, to be fixed by backtest.

The surcharge is taken in `afterSwap` via `afterSwapReturnsDelta`, from the output token. The hook mints the amount to itself as ERC-6909 claims on the PoolManager, credited to that pool's reserve. The reserve therefore accumulates in whichever token swappers are buying, which is the token LPs are being drained of and the right asset to pay claims in.

The surcharge is in addition to the pool's LP fee. It is visible in quotes like any hook fee, so routers price it. A surcharge-free unhooked pool of the same pair will always quote slightly better. The pitch to LPs is lower net loss; the pitch to routers is that k-scaled surcharges on small trades round to zero.

LP fees themselves are untouched and go to LPs as usual.

## Payout: measuring a position's realized IL

A position's IL is only known when it closes.

- On `afterAddLiquidity` the hook records, per position, the amounts deposited (x₀, y₀) and the reference price at entry Pₑ.
- On `beforeRemoveLiquidity` it reads the amounts coming out (x₁, y₁) and the reference price at exit Pₓ, and computes the loss versus holding, in token1 units:

```
IL = (x₀ · Pₓ + y₀) − (x₁ · Pₓ + y₁)
```

The first term is what the deposit would be worth today if never pooled. The second is what the position actually returns. Fees earned are excluded: they are the LP's compensation and are not netted against the claim. Netting them would make the product cover only LPs who also lost on fees, which is nearly nobody.

If IL ≤ 0 the LP is paid nothing. If IL > 0 the claim is:

```
payout = min(c · IL, share of reserve)
```

c is the **coverage ratio**, a hard cap on the fraction of IL reimbursed (for example 0.5). The reserve-share term is defined under the pro-rata rule below.

### Position accounting

- Positions are identified by (owner, tickLower, tickUpper, salt), the same key v4 uses.
- Partial removals are handled pro-rata: the recorded x₀, y₀ are scaled by the fraction of liquidity withdrawn and the remainder stays on record.
- Additions to an existing position update the record to a liquidity-weighted average entry.

## Payout rules

The reserve is never a promise. Four rules keep it solvent and hard to game.

| Rule | Setting | Why |
| --- | --- | --- |
| Coverage cap c | ≤ 50% of IL | Full coverage is undercapitalized by construction; Bancor paused its 100% IL protection in June 2022 when claims exceeded the reserve. |
| Pro-rata draw | A single claim may take at most its liquidity share of the reserve times a multiplier m. A position that was 2% of pool liquidity at exit with m = 3 may draw at most 6% of the reserve. | Prevents one large exit from draining the reserve ahead of everyone else; m keeps small claims from being starved. |
| Minimum hold | Positions open less than H (e.g. 24h) get no payout | Stops deposit → nudge price → withdraw → claim within a block or a few. |
| Price reference | Chainlink feed where one exists; otherwise the pool's own TWAP over a long window (≥ 30 min) | A spot or short TWAP can be moved by the claimant. Entry and exit use the same reference, so the only way to inflate IL is to move a long-window price. |

When the reserve is empty, withdrawals still succeed and pay nothing. The hook never blocks liquidity removal.

## Ownership

The reserve belongs to the pool, not to the deployer. There is no admin withdrawal and no owner. Parameters (k, c, H, m, oracle) are fixed per pool at initialization and immutable thereafter.
