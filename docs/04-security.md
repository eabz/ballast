# Security

## Trust model

- **No privileged roles.** No owner, upgrade path, pause or admin withdrawal. If a flaw is found, the fix is a new hook and an LP migration.
- **Pool-owned reserve.** Surcharges belong to the pool that collected them and are only paid out to that pool's LPs.
- **Immutable parameters.** k, c, H, m and the oracle are fixed in `afterInitialize`.
- **Withdrawals always succeed.** The hook never makes liquidity removal revert. The worst case for an LP is a payout of zero.
- **Minimal external surface.** Payout is a `take` from the PoolManager. The hook makes no calls to the LP and executes no swaps.

Several of these properties are not yet guaranteed by the design. AV-03, AV-17, AV-18 and AV-19 cover the gaps.

## Attack surface

All known attacks, the current defense against each, and the checks that close them are in [07-attack-vectors.md](07-attack-vectors.md).

Vectors marked `design-fix` need a change in `design-logic.md` before implementation: AV-02, AV-03, AV-05, AV-06, AV-12, AV-13, AV-15 and AV-19.
