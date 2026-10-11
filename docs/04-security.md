# Security

The security properties Ballast is designed to hold, and where to find the attacks against them.

## Trust model

- **No privileged roles.** No owner, upgrade path, pause or admin withdrawal. If a flaw is found, the fix is a new hook and an LP migration.
- **Pool-owned reserve.** Surcharges belong to the pool that collected them and are only paid out to that pool's LPs.
- **One pool, immutable parameters.** Each deployment serves one pool. The PoolKey, k, c, H, m and oracle settings are constructor immutables; `afterInitialize` rejects any other pool.
- **Withdrawals always succeed.** The hook never makes liquidity removal revert. When the reserve is empty, or a claim fails any rule, the payout is zero and the removal goes through.
- **Minimal external surface.** The hook makes no calls to the LP and executes no swaps.

## Custody

The hook holds no tokens directly. Reserve balances are ERC-6909 claims on the PoolManager; with one pool per deployment, the hook's whole balance is that pool's reserve. A payout burns those claims and is returned from `afterRemoveLiquidity` as a hook delta credited to the caller, inside the PoolManager's unlock, so standard v4 locking applies and the LP receives it through their router or PositionManager.

## Known gaps

Properties that depend on attack-vector fixes, and where those fixes stand:

| Property | Depends on | Status |
| --- | --- | --- |
| Pool-owned reserve | [AV-18](06-attack-vectors.md#av-18-cross-pool-drain), [AV-19](06-attack-vectors.md#av-19-initializer-set-parameters) | mitigated |
| Payout reaches the LP | [AV-03](06-attack-vectors.md#av-03-payout-recipient) | designed |
| Withdrawals always succeed | [AV-17](06-attack-vectors.md#av-17-oracle-failure-blocks-withdrawals), [AV-21](06-attack-vectors.md#av-21-unsettled-hook-delta) | AV-17 designed, AV-21 open |
| Minimal external surface | [AV-20](06-attack-vectors.md#av-20-reentrancy-during-payout) | open |

## Attack surface

Every known attack, the defense the design offers against it, and the checks that close it are in [Attack vectors](06-attack-vectors.md). That page is the single list. Other pages link to it by ID (AV-nn) and do not describe attacks themselves.
