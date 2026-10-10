# Ballast backtest

Replays a Uniswap v4 ETH/USDC pool's full swap and liquidity history under the Ballast rules to size k, c, H and m. See `docs/05-parameters.md` for what the numbers mean.

## Setup

Put an archive-capable JSON-RPC URL in `../.env` as `BASE_RPC_URL` (the name is historical; the chain is selected with `--chain`). The indexer asserts the chain id matches.

```bash
uv sync
```

## Index

Fetches `Initialize`, `Swap` and `ModifyLiquidity` logs for the pool in 10k-block chunks into `data/<chain>/<fee>/`. Chunks are cached as raw logs, so reruns only fetch what is missing, and decode fixes never need a refetch. Block timestamps are sampled every 1,000 blocks and interpolated.

```bash
uv run python -m ballast_backtest.indexer --chain mainnet --fee 500
```

## Replay

```bash
uv run python -m ballast_backtest.replay --chain mainnet --fee 500 --k 0.1,0.2,0.3 --c 0.3,0.5 --H 24,72 --m 2,3,5 --out results
```

Reports, per the design doc: surcharge as bps of volume and per median trade, reserve-to-claims ratio, share of eligible losing LPs made whole to c, and a monthly inflow-versus-claims table.

## Method notes

- `loss_net = a0·P1 + a1` uses the swap's actual deltas, which include the LP fee the swapper paid. `loss_gross` adds that fee back and is pure LVR. The hook formula in the design doc is the net form; both are reported because they differ a lot on small trades.
- Reference price is a 30-minute geometric TWAP built from the pool's own tick path. Change with `--twap-min`.
- Positions are keyed by (sender, tickLower, tickUpper, salt). On mainnet every event comes through the PositionManager, so salt is the token id.
- The reserve is tracked in both tokens and valued at the current price; payouts draw both tokens pro rata by value.
- Fees earned by the LP are excluded from IL, as in the design.
