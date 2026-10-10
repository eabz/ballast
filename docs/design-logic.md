# Ballast: Design Logic

Oct 10, 2026 · @Enrique Berrueta

Ballast is a Uniswap v4 hook for volatile pairs: swappers pay a small surcharge proportional to the loss their trade imposes on LPs, the surcharge accumulates in a pool-owned reserve, and LPs who withdraw at a loss versus holding get a capped, pro-rata share of that loss back.

## The loss being covered

An LP in a volatile pair ends up holding more of the token that fell and less of the token that rose. Versus simply holding the deposit, that is a loss whichever way price moves. It is called impermanent loss (IL) when measured over a position's life, and loss-versus-rebalancing (LVR) when measured swap by swap; over long horizons the two are approximately the same number.

LP profit is fees minus that loss. On most volatile pairs the loss is a large fraction of fees, and in high-volatility periods it exceeds them. Dynamic-fee hooks shrink the gap; nothing on v4 today pays any of it back.

The loss is caused by the external price moving, not by the swap. A swap only transmits it: an arbitrageur sees the pool is stale, trades it back to market, and keeps the difference. If no one arbs, LPs still hold the mispriced portfolio.

## Why not charge it 1:1

The loss a swap imposes on LPs is computable in `afterSwap`. For a swap that sells Δx of token0 and takes Δy of token1, moving the price from P₀ to P₁ (token1 per token0):

```latex
\text{loss}_{\text{swap}} = \Delta y - \Delta x \cdot P_1 \;\ge\; 0
```

It is non-negative because the trader got an average price better than P₁. Summed over all swaps, it is the pool's LVR.

Charging it back in full fails for two reasons:

1. It is the trader's price impact, already paid. Adding it again roughly doubles price impact. The arbitrageur's profit is exactly this term, so at 1:1 arbitrage is zero-EV and stops. The pool goes stale and LPs still carry the mispriced portfolio, now without the fee.
2. Noise trades do not cause lasting loss. A trade that pushes price up and a later trade that pushes it back produce two positive loss terms that net to zero for LPs. Charging both makes the pool uncompetitive with any unhooked pool, and routers avoid it.

This is why Bunni's am-AMM, Angstrom and LodeHook capture a fraction of LVR through auctions or top-of-block premiums rather than all of it. The equilibrium is to take as much as possible while the arbitrageur still shows up.

## How Ballast works

[Diagram: Ballast flow · swap lane funds the reserve, LP lane draws from it. See 02-mechanism.md for the rendered version.]

The two lanes never meet at swap time. Collection happens on every swap; payout happens only when a position closes, and only from what the reserve holds at that moment.

## Collection: the per-swap surcharge

Every swap pays a surcharge proportional to the loss it imposes, not a flat rate:

```latex
\text{surcharge} = k \cdot (\Delta y - \Delta x \cdot P_1), \qquad 0 < k < 1
```

k is the ballast rate. Noise trades with tiny price impact pay almost nothing; large price-moving trades, which are disproportionately informed or arbitrage flow, fund most of the reserve. A starting range for k is 0.1 to 0.3, to be fixed by backtest.

The surcharge is taken in `afterSwap` via `afterSwapReturnsDelta`, from the output token. The hook mints the amount to itself as ERC-6909 claims on the PoolManager, credited to that pool's reserve. The reserve therefore accumulates in whichever token swappers are buying, which is the token LPs are being drained of and the right asset to pay claims in.

The surcharge is in addition to the pool's LP fee. It is visible in quotes like any hook fee, so routers price it. A surcharge-free unhooked pool of the same pair will always quote slightly better; the pitch to LPs is lower net loss, and to routers it is that k-scaled surcharges on small trades round to zero.

LP fees themselves are untouched and go to LPs as usual.

## Payout: measuring a position's realized IL

A position's IL is only known when it closes. On `afterAddLiquidity` the hook records, per position, the amounts deposited (x₀, y₀) and the reference price at entry Pₑ. On `beforeRemoveLiquidity` it reads the amounts coming out (x₁, y₁) and the reference price at exit Pₓ, and computes the loss versus holding, in token1 units:

```latex
\text{IL} = (x_0 \cdot P_x + y_0) - (x_1 \cdot P_x + y_1)
```

The first term is what the deposit would be worth today if never pooled; the second is what the position actually returns. Fees earned are excluded: they are the LP's compensation and are not netted against the claim (netting them would make the product cover only LPs who also lost on fees, which is nearly nobody).

If IL ≤ 0 the LP is paid nothing. If IL > 0 the claim is:

```latex
\text{payout} = \min\big(c \cdot \text{IL},\; \text{share of reserve}\big)
```

c is the coverage ratio, a hard cap on the fraction of IL reimbursed (for example 0.5). The reserve-share term is defined in the next section.

Positions are identified by (owner, tickLower, tickUpper, salt), the same key v4 uses. Partial removals are handled pro-rata: the recorded x₀, y₀ are scaled by the fraction of liquidity withdrawn and the remainder stays on record. Additions to an existing position update the record to a liquidity-weighted average entry.

## Payout rules

The reserve is never a promise. Four rules keep it solvent and hard to game.

| Rule | Setting | Why |
| --- | --- | --- |
| Coverage cap c | ≤ 50% of IL | Full coverage is undercapitalized by construction; Bancor paused its 100% IL protection in June 2022 when claims exceeded the reserve. |
| Pro-rata draw | A single claim may take at most its liquidity share of the reserve, e.g. a position that was 2% of pool liquidity at exit may draw at most 2% × reserve (times a multiplier m, e.g. 3, so small claims are not starved) | Prevents one large exit from draining the reserve ahead of everyone else. |
| Minimum hold | Positions open less than H (e.g. 24h) get no payout | Stops deposit → nudge price → withdraw → claim within a block or a few. |
| Price reference | Chainlink feed where one exists; otherwise the pool's own TWAP over a long window (≥ 30 min) | A spot or short TWAP can be moved by the claimant. Entry and exit use the same reference, so the only way to inflate IL is to move a long-window price. |

When the reserve is empty, withdrawals still succeed and pay nothing. Ownership, custody and the trust model: `04-security.md`.

## Hook lifecycle

Five permission bits are set; everything else is off. The swap curve is untouched (`vanillaSwap: true`), which keeps the hook eligible for Uniswap interface routing and simple to audit.

| Callback | Flag | What Ballast does |
| --- | --- | --- |
| `afterInitialize` | on | Stores the pool's immutable parameters (k, c, H, m, oracle address). Rejects pools whose reference asset has no oracle unless a TWAP fallback is configured. |
| `beforeSwap` | on | Records `sqrtPriceX96` before the swap in transient storage. |
| `afterSwap` + `afterSwapReturnsDelta` | on | Reads the post-swap price, computes loss = Δy − Δx·P₁, returns a delta of k·loss in the output token, mints it as ERC-6909 to the pool's reserve. |
| `afterAddLiquidity` | on | Records or updates the position's entry amounts and entry reference price. |
| `beforeRemoveLiquidity` | on | Computes exit amounts and IL, applies the rules, burns ERC-6909 from the reserve and transfers the payout to the LP. Clears or scales the position record. |

`beforeAddLiquidity`, donate hooks and the liquidity return-delta flags stay off. The hook holds no funds outside the PoolManager; all reserve balances are ERC-6909 claims.

## Security

Trust model and custody: `04-security.md`. Attacks, defenses and open findings: `06-attack-vectors.md`.

## Parameters

Four numbers decide whether the economics close. None should be guessed; all come from replaying real pool history.

| Parameter | Meaning | Starting range |
| --- | --- | --- |
| k | Ballast rate: share of per-swap loss collected | 0.1 – 0.3 |
| c | Coverage cap: max share of a position's IL reimbursed | 0.3 – 0.5 |
| H | Minimum hold before a claim is valid | 24 – 72 h |
| m | Pro-rata multiplier on a claim's liquidity share | 2 – 5 |

The backtest that fixes these values and the delivery plan are in `roadmap.md`.

Name note: a `BallastHook` already exists in the registry (an unrelated launchpad fee hook on Robinhood Chain). The contract is named `BallastReserveHook` to avoid the collision; the project name stays Ballast.
