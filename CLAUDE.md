# Ballast — project guide

Ballast is a Uniswap v4 hook (`BallastReserveHook`) that collects a per-swap surcharge proportional to LP loss into a pool-owned ERC-6909 reserve and pays LPs a capped, pro-rata share of realized impermanent loss on withdrawal.

## Current phase

Scaffolded, not implemented. `src/BallastReserveHook.sol` has the final permission flags and pass-through callbacks with a TODO per callback. Do not implement the economics until the backtest in `docs/roadmap.md` has fixed k, c, H and m and the remaining `design-fix` vectors in `docs/06-attack-vectors.md` are resolved. Resolved decisions are in the Design decisions section of `docs/design-logic.md`.

## Docs layout

- Security properties go in `docs/04-security.md`. Attacks go only in `docs/06-attack-vectors.md`; other pages link to them by AV ID.
- Status, plans and next steps go only in `docs/roadmap.md`, which is temporary and will be deleted.

## Commands

- `forge build` and `forge test` from the repo root. Run `forge fmt` before committing.
- Dependencies are submodules pinned in `foundry.lock`; use `forge install` rather than editing `lib/` by hand.
- Imports use the `@uniswap/v4-core/`, `@uniswap/v4-periphery/` and `@openzeppelin/uniswap-hooks/` remappings. `SwapParams` and `ModifyLiquidityParams` come from `types/PoolOperation.sol`, not `IPoolManager`.
- Tests deploy the hook with `deployCodeTo` at an address carrying the seven flag bits; see the `FLAGS` constant in the test. The constructor takes the pool's currency0, currency1, fee and tickSpacing.
- Every attack-vector fix ships with a test named `test_AVnn_*` and an update to that vector in `docs/06-attack-vectors.md`.

## Source of truth

`docs/design-logic.md` is the original design document and wins on any conflict with the split pages in `docs/`. When the design changes, update `design-logic.md` first, then the affected page.

## Conventions

- Prices are quoted as token1 per token0. IL and payouts are denominated in token1 units.
- Symbols: k ballast rate, c coverage cap, H minimum hold, m pro-rata multiplier, Pₑ entry reference price, Pₓ exit reference price. Use these consistently; see `docs/glossary.md`.
- Position key is (owner, tickLower, tickUpper, salt), the same as v4.
- Planned stack: Foundry, v4-template, Base (ETH/USDC) for backtest and fork tests, Unichain Sepolia for testnet.
