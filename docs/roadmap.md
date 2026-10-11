# Roadmap

Temporary planning page. It holds everything about what comes next and how we get there. Delete it once the hook ships.

## Status

The Foundry project builds and the hook compiles with its final permission flags. Every callback is still a pass-through.

## Steps

Steps are in order; each one gates the next.

- [x] **Documentation.** `design-logic.md` is the canonical source.
- [x] **Scaffold.** `BallastReserveHook` from v4-template, with the permission flags (now seven bits), pass-through callbacks and an address-mining deploy script.
- [ ] **Backtest** on Base ETH/USDC to fix k, c, H and m. See [Backtest plan](#backtest-plan).
- [ ] **Resolve design findings.** Settle every `design-fix` vector in [Attack vectors](06-attack-vectors.md) in `design-logic.md`, then update the affected pages. Done for AV-01, 02, 03, 05, 06, 08, 10, 13, 17, 18, 19, 23 (status `designed`). Remaining: AV-12 and AV-28 (per-block loss), and the AV-15 oracle settings, which need backtest data.
- [ ] **Implement** the callbacks. Each TODO in `src/BallastReserveHook.sol` maps to a row in [Hook lifecycle](03-hook-lifecycle.md).
- [ ] **Unit tests.** Both swap directions, exact-in and exact-out, partial removals, empty reserve, and one test per open attack vector.
- [ ] **Fork test** against the live Base pool with replayed swaps.
- [ ] **Testnet** deploy on Unichain Sepolia, then registry submission and the Uniswap routing allowlist form.

```mermaid
flowchart LR
    D[Documentation] --> S["Scaffold<br/>permission flags"]
    S --> B["Backtest<br/>Base ETH/USDC"]
    B --> P["Fix k, c, H, m"]
    P --> AV["Resolve design-fix<br/>attack vectors"]
    AV --> I[Implement callbacks]
    I --> U["Unit tests<br/>both directions, exact-in/out,<br/>partial removals, empty reserve,<br/>one per attack vector"]
    U --> F["Fork test<br/>live Base pool, replayed swaps"]
    F --> T["Testnet deploy<br/>Unichain Sepolia"]
    T --> REG[Registry submission]
    T --> RT[Routing allowlist form]
```

## Backtest plan

Replay several months of swaps and liquidity events from the Base ETH/USDC v4 pool. The code is in `backtest/` ([README](../backtest/README.md)). Parameter meanings and starting ranges are in [Parameters](05-parameters.md).

For each candidate k:

1. Accumulate the reserve swap by swap using loss = Δy − Δx·P₁.
2. For each closed position, compute realized IL at the entry and exit reference prices.
3. Apply the payout rules under each candidate c, H and m.

Report:

- Reserve-to-claims ratio over time.
- Share of losing LPs paid up to c.
- Surcharge in bps of volume, on median trades and in aggregate.
- Whether splitting a position across salts beats the pro-rata cap ([AV-07](06-attack-vectors.md#av-07-splitting-across-salts)).
- Reserve accrual when arbitrageurs split swaps ([AV-12](06-attack-vectors.md#av-12-swap-splitting)).
- Loss measured per swap vs per block, and the surcharge in bps under each ([AV-28](06-attack-vectors.md#av-28-per-swap-loss-over-counts-in-block-round-trips)).
- Per-block ratchet candidate for AV-12/AV-28: surcharge bps and reserve accrual vs per-swap.
- TWAP cardinality, window, deviation bound and minimum depth ([AV-15](06-attack-vectors.md#av-15-twap-fallback)).
- Payout distribution under adversarial claim ordering ([AV-25](06-attack-vectors.md#av-25-front-running-exits)).

### Success criterion

Pending. Aggregate coverage is bounded near k (see [design-logic.md](design-logic.md)), so the target below will be restated once a multi-month backtest is in. Current wording:

The economics work if some k keeps the surcharge under about 2 bps of volume on median trades and still funds payouts at c ≥ 0.3 ([AV-26](06-attack-vectors.md#av-26-unroutable-pool)).
