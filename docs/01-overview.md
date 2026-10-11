# Overview

Ballast covers part of the loss LPs take on volatile pairs. It funds that coverage from a surcharge on the swaps that cause the loss.

## The loss

An LP in a volatile pair ends up holding more of the token that fell and less of the token that rose. Compared with simply holding the deposit, that is a loss in either direction.

- **Impermanent loss (IL)** is that loss measured over a position's life: value at exit minus the value of holding the original deposit.
- **Loss-versus-rebalancing (LVR)** is the same loss measured as the price moves, block by block. Over long horizons the two converge.

The loss one swap imposes on LPs can be computed in `afterSwap`. For a swap that sells Δx of token0 for Δy of token1 and moves the price from P₀ to P₁ (token1 per token0):

```
loss_swap = Δy − Δx · P₁  ≥ 0
```

Summed per block, this approximates the pool's LVR. Summed per swap it overstates LVR, because both legs of an in-block round trip count as loss ([AV-28](06-attack-vectors.md#av-28-per-swap-loss-over-counts-in-block-round-trips)). LP profit is fees minus LVR, and on volatile pairs LVR is often a large fraction of fees.

## Why only a fraction is collected

Charging the full loss back to every swap would wipe out the arbitrageur's profit, so arbitrage stops and the pool goes stale. It would also charge noise trades that later reverse, which makes the pool uncompetitive with unhooked pools. Ballast collects a fraction **k** of the loss instead, measured per block. Small trades pay almost nothing, and large price-moving trades fund most of the reserve.

Because the reserve takes in about k × LVR and total IL is about LVR, aggregate payouts are bounded by roughly k of total IL, whatever the per-claim cap c is. Expect 10–20%.

The full reasoning is in [design-logic.md](design-logic.md).
