# Ballast

Ballast is a Uniswap v4 hook for volatile pairs that pays liquidity providers back part of their impermanent loss.

- **Collection.** Every swap pays a small surcharge proportional to the loss it imposes on LPs. Surcharges accumulate in a reserve owned by the pool, held as ERC-6909 claims on the PoolManager.
- **Payout.** When an LP withdraws at a loss versus holding, the hook pays back a share of that loss from the reserve. The share is capped by a coverage ratio, a pro-rata limit and a minimum hold time.
- **No custodian.** No owner or admin keys, and withdrawals always go through. See [Security](docs/04-security.md).

The contract is `BallastReserveHook`.

## Status

Scaffolded; callbacks are not implemented yet. Current status and next steps are in the [roadmap](docs/roadmap.md).

## Documentation

| Page | Contents |
| --- | --- |
| [01-overview.md](docs/01-overview.md) | The loss Ballast covers and why only a fraction is collected |
| [02-mechanism.md](docs/02-mechanism.md) | Surcharge, payout formula and payout rules |
| [03-hook-lifecycle.md](docs/03-hook-lifecycle.md) | Permission flags, callback behaviour and flow diagrams |
| [04-security.md](docs/04-security.md) | Trust model, custody and known gaps |
| [05-parameters.md](docs/05-parameters.md) | k, c, H, m and how they feed the hook |
| [06-attack-vectors.md](docs/06-attack-vectors.md) | Every known attack, its defense and the checks that close it |
| [roadmap.md](docs/roadmap.md) | Status, delivery steps and backtest plan. Temporary. |
| [glossary.md](docs/glossary.md) | Terms and symbols |
| [design-logic.md](docs/design-logic.md) | Original design document. Canonical when pages disagree. |

## Development

Foundry project based on [v4-template](https://github.com/uniswapfoundation/v4-template). Dependencies are git submodules pinned in `foundry.lock`.

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
| `src/BallastReserveHook.sol` | The hook. Flags are final; each callback has a TODO. |
| `test/BallastReserveHook.t.sol` | Flag assertions, swap pass-through, removal never blocked. |
| `script/00_DeployHook.s.sol` | Mines a CREATE2 salt matching the flag bits and deploys. |
| `script/01..03_*.s.sol` | Create a pool, add liquidity, swap. From the template. |
| `test/utils/` | Deployment and position helpers from the template. |
| `backtest/` | Python indexer and replay for the parameter backtest. See [backtest/README.md](backtest/README.md). |
