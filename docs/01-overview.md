# Overview

Ballast is a Uniswap v4 hook for volatile pairs. Swappers pay a small surcharge proportional to the loss their trade imposes on LPs, the surcharge accumulates in a pool-owned reserve, and LPs who withdraw at a loss versus holding get a capped, pro-rata share of that loss back.

## The loss being covered

An LP in a volatile pair ends up holding more of the token that fell and less of the token that rose. Versus simply holding the deposit, that is a loss whichever way price moves. It is called impermanent loss (IL) when measured over a position's life, and loss-versus-rebalancing (LVR) when measured swap by swap. Over long horizons the two are approximately the same number.

LP profit is fees minus that loss. On most volatile pairs the loss is a large fraction of fees, and in high-volatility periods it exceeds them. Dynamic-fee hooks shrink the gap; nothing on v4 today pays any of it back.

The loss is caused by the external price moving, not by the swap. A swap only transmits it: an arbitrageur sees the pool is stale, trades it back to market, and keeps the difference. If no one arbs, LPs still hold the mispriced portfolio.

## Why not charge it 1:1

The loss a swap imposes on LPs is computable in `afterSwap`. For a swap that sells Δx of token0 and takes Δy of token1, moving the price from P₀ to P₁ (token1 per token0):

```
loss_swap = Δy − Δx · P₁  ≥ 0
```

It is non-negative because the trader got an average price better than P₁. Summed over all swaps, it is the pool's LVR.

Charging it back in full fails for two reasons:

1. **It is the trader's price impact, already paid.** Adding it again roughly doubles price impact. The arbitrageur's profit is exactly this term, so at 1:1 arbitrage is zero-EV and stops. The pool goes stale and LPs still carry the mispriced portfolio, now without the fee.
2. **Noise trades do not cause lasting loss.** A trade that pushes price up and a later trade that pushes it back produce two positive loss terms that net to zero for LPs. Charging both makes the pool uncompetitive with any unhooked pool, and routers avoid it.

This is why Bunni's am-AMM, Angstrom and LodeHook capture a fraction of LVR through auctions or top-of-block premiums rather than all of it. The equilibrium is to take as much as possible while the arbitrageur still shows up.

Ballast takes a fraction k of the per-swap loss. See [Mechanism](02-mechanism.md).
