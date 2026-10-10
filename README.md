# Ballast

Ballast is a Uniswap v4 hook for volatile pairs that pays liquidity providers back part of their impermanent loss.

Swappers pay a small surcharge proportional to the loss their trade imposes on LPs. The surcharge accumulates in a pool-owned reserve held as ERC-6909 claims on the PoolManager. When an LP withdraws at a loss versus holding, the hook pays a capped, pro-rata share of that loss back from the reserve.

The contract is named `BallastReserveHook` (an unrelated `BallastHook` already exists in the hook registry). The project name is Ballast.

## Status

Scaffolded. The Foundry project builds and the hook compiles with the correct permission flags, but every callback is a pass-through. The next step is a backtest on Base ETH/USDC to fix the four economic parameters before the callbacks are implemented. See [06-roadmap.md](docs/06-roadmap.md).

## Documentation

| Page | Contents |
| --- | --- |
| [01-overview.md](docs/01-overview.md) | The loss being covered and why it cannot be charged back 1:1 |
| [02-mechanism.md](docs/02-mechanism.md) | Collection on swaps, payout on withdrawal, the four solvency rules |
| [03-hook-lifecycle.md](docs/03-hook-lifecycle.md) | Permission flags and what each callback does |
| [04-security.md](docs/04-security.md) | Trust model and attack surface |
| [05-parameters.md](docs/05-parameters.md) | k, c, H, m and the backtest that fixes them |
| [06-roadmap.md](docs/06-roadmap.md) | Ordered next steps |
| [diagrams.md](docs/diagrams.md) | Mermaid DAGs: lanes, swap flow, payout decision, position lifecycle, parameter and delivery dependencies |
| [glossary.md](docs/glossary.md) | Terms and symbols |
| [design-logic.md](docs/design-logic.md) | Original design document, kept verbatim as the canonical source |

## Development

Foundry project scaffolded from [v4-template](https://github.com/uniswapfoundation/v4-template). Dependencies are git submodules pinned in `foundry.lock`.

```bash
git clone --recurse-submodules <repo-url> && cd ballast
```

```bash
forge build
```

```bash
forge test
```

| Path | Contents |
| --- | --- |
| `src/BallastReserveHook.sol` | The hook. Permission flags are final; callback bodies are TODO. |
| `test/BallastReserveHook.t.sol` | Flag assertions, swap pass-through, and the never-block-removal invariant. |
| `script/00_DeployHook.s.sol` | Mines a CREATE2 salt for the flag bits and deploys. |
| `script/01..03_*.s.sol` | Create pool, add liquidity, swap. From the template. |
| `test/utils/` | Deployers, BaseTest and EasyPosm helpers. From the template. |

## Core formulas

Per-swap surcharge, taken in the output token:

```
surcharge = k · (Δy − Δx · P₁),   0 < k < 1
```

Realized IL at withdrawal, in token1 units, fees excluded:

```
IL = (x₀ · Pₓ + y₀) − (x₁ · Pₓ + y₁)
payout = min(c · IL, m · liquidityShare · reserve)   if IL > 0 and hold ≥ H
```

## Principles

- The reserve is never a promise. Empty reserve means withdrawals succeed and pay nothing.
- The hook never blocks liquidity removal.
- No owner, no admin withdrawal, no upgrade path, no pause. Parameters are immutable per pool.
- The swap curve is untouched. LP fees are untouched.
