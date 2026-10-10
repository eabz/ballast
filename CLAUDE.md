# Ballast — project guide

Ballast is a Uniswap v4 hook (`BallastReserveHook`) that collects a per-swap surcharge proportional to LP loss into a pool-owned ERC-6909 reserve and pays LPs a capped, pro-rata share of realized impermanent loss on withdrawal.

## Current phase

Documentation and design only. Do not scaffold Solidity until the backtest in `docs/05-parameters.md` has fixed k, c, H and m.

## Source of truth

`docs/design-logic.md` is the original design document and wins on any conflict with the split pages in `docs/`. When the design changes, update `design-logic.md` first, then the affected page.

## Conventions

- Prices are quoted as token1 per token0. IL and payouts are denominated in token1 units.
- Symbols: k ballast rate, c coverage cap, H minimum hold, m pro-rata multiplier, Pₑ entry reference price, Pₓ exit reference price. Use these consistently; see `docs/glossary.md`.
- Position key is (owner, tickLower, tickUpper, salt), the same as v4.
- Planned stack: Foundry, v4-template, Base (ETH/USDC) for backtest and fork tests, Unichain Sepolia for testnet.
