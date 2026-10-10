# Overview

Ballast covers part of the loss LPs take on volatile pairs. It funds that coverage from a surcharge on the swaps that cause the loss.

## The loss

An LP in a volatile pair ends up holding more of the token that fell and less of the token that rose. Compared with simply holding the deposit, that is a loss in either direction.

- **Impermanent loss (IL)** is that loss measured over a position's life: value at exit minus the value of holding the original deposit.
- **Loss-versus-rebalancing (LVR)** is the same loss measured swap by swap. Over long horizons the two converge.

The loss one swap imposes on LPs can be computed in `afterSwap`. For a swap that sells Δx of token0 for Δy of token1 and moves the price from P₀ to P₁ (token1 per token0):

```
loss_swap = Δy − Δx · P₁  ≥ 0
```

The sum over all swaps is the pool's LVR. LP profit is fees minus this loss, and on volatile pairs the loss is often a large fraction of fees.

## Why only a fraction is collected

Charging the full loss back to every swap would wipe out the arbitrageur's profit, so arbitrage stops and the pool goes stale. It would also charge noise trades that later reverse, which makes the pool uncompetitive with unhooked pools. Ballast collects a fraction **k** of each swap's loss instead. Small trades pay almost nothing, and large price-moving trades fund most of the reserve.

The full reasoning is in [design-logic.md](design-logic.md).
