# Roadmap

Steps are in order; each one gates the next.

- [x] **Documentation.** `design-logic.md` is the canonical source.
- [x] **Scaffold.** `BallastReserveHook` from v4-template, with the six flag bits, pass-through callbacks and an address-mining deploy script.
- [ ] **Backtest** on Base ETH/USDC to fix k, c, H and m. See [Parameters](05-parameters.md).
- [ ] **Resolve design findings.** Settle AV-02, AV-03, AV-05, AV-06, AV-12, AV-13, AV-15 and AV-19 in `design-logic.md`, then update the affected pages. See [Attack vectors](07-attack-vectors.md).
- [ ] **Implement** the callbacks. Each TODO in `src/BallastReserveHook.sol` maps to a row in [Hook lifecycle](03-hook-lifecycle.md).
- [ ] **Unit tests.** Both swap directions, exact-in and exact-out, partial removals, empty reserve, and one test per open attack vector.
- [ ] **Fork test** against the live Base pool with replayed swaps.
- [ ] **Testnet** deploy on Unichain Sepolia, then registry submission and the Uniswap routing allowlist form.
