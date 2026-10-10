# Roadmap

Ordered. Each step gates the next.

- [ ] **Documentation layer** — this folder. Keep `design-logic.md` as the canonical source.
- [ ] **Backtest** on Base ETH/USDC with the indexer; pick k, c, H, m. See [Parameters](05-parameters.md).
- [ ] **Scaffold** `BallastReserveHook` from v4-template; mine the hook address for the five flags.
- [ ] **Unit tests**: surcharge in both swap directions and both exact-in/exact-out; IL math on partial removals; reserve-empty path.
- [ ] **Fork test** against the live Base pool with replayed swaps.
- [ ] **Testnet deploy** (Unichain Sepolia), then registry submission and the Uniswap routing allowlist form.

## Naming

A `BallastHook` already exists in the registry (an unrelated launchpad fee hook on Robinhood Chain). The contract is named `BallastReserveHook` to avoid the collision; the project name stays Ballast.
