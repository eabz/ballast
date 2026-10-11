// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";

// Ballast-rate tiers, in parts per million like v4 fees. The pool creator picks one at deployment.
// Backtest on mainnet ETH/USDC (mature regime): surcharge 1.7 / 2.8 / 4.0 bps of volume,
// funding roughly 15% / 25% / 35% of realized IL. See docs/07-backtest-results.md.
uint24 constant K_LIGHT = 300_000;
uint24 constant K_STANDARD = 500_000;
uint24 constant K_HEAVY = 700_000;

/// @title BallastReserveHook
/// @notice Uniswap v4 hook that collects a per-swap surcharge proportional to the loss a swap
///         imposes on LPs into a pool-owned ERC-6909 reserve, and pays LPs a capped, pro-rata share
///         of realized impermanent loss when they withdraw.
/// @dev Scaffold: callbacks are pass-throughs. Parameters are fixed per deployment. The pool creator
///      picks one of three ballast-rate tiers; coverage cap, minimum hold and pro-rata multiplier are
///      constants from the backtest (docs/07-backtest-results.md).
///      Design: docs/design-logic.md. Per-callback behaviour: docs/03-hook-lifecycle.md.
contract BallastReserveHook is BaseHook {
    using PoolIdLibrary for PoolKey;

    /// @notice The only pool this deployment serves (AV-18, AV-19). The hooks field is this contract.
    Currency public immutable currency0;
    Currency public immutable currency1;
    uint24 public immutable fee;
    int24 public immutable tickSpacing;

    /// @notice Share of each swap's loss collected into the reserve (one of the K_* tiers).
    uint24 public immutable k;

    /// @notice Max share of a position's realized IL reimbursed, in ppm (c = 0.5).
    uint24 public constant COVERAGE_CAP = 500_000;
    /// @notice Minimum time a position must be open before a claim is valid (H).
    uint32 public constant MIN_HOLD = 24 hours;
    /// @notice Multiplier on a claim's liquidity share of the reserve (m).
    uint8 public constant PRORATA_MULTIPLIER = 3;

    /// @notice Thrown when a pool other than the one fixed at construction is initialized.
    error PoolNotAllowed();
    /// @notice Thrown when the constructor receives a k that is not one of the three tiers.
    error InvalidTier();

    constructor(
        IPoolManager _poolManager,
        Currency _currency0,
        Currency _currency1,
        uint24 _fee,
        int24 _tickSpacing,
        uint24 _k
    ) BaseHook(_poolManager) {
        if (_k != K_LIGHT && _k != K_STANDARD && _k != K_HEAVY) revert InvalidTier();
        currency0 = _currency0;
        currency1 = _currency1;
        fee = _fee;
        tickSpacing = _tickSpacing;
        k = _k;
    }

    /// @dev Five callbacks are enabled. afterSwap and afterRemoveLiquidity also return deltas, so
    ///      seven flag bits are set. The payout is credited to the caller's delta (AV-03), so it
    ///      reaches the LP through any router or PositionManager. The swap curve is untouched (no
    ///      beforeSwapReturnDelta), which keeps the hook eligible for interface routing.
    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: true,
            beforeAddLiquidity: false,
            afterAddLiquidity: true,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: true,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: true
        });
    }

    // -----------------------------------------------------------------------
    // Lifecycle. See docs/03-hook-lifecycle.md for what each step must do.
    // -----------------------------------------------------------------------

    /// @dev Rejects every pool except the one fixed at construction, so the hook's ERC-6909 balance is
    ///      exactly that pool's reserve (AV-18) and no initializer chooses tokens or parameters
    ///      (AV-19). The PoolManager already rejects a second initialization of the same key.
    ///      TODO: seed the first TWAP observation.
    function _afterInitialize(address, PoolKey calldata key, uint160, int24) internal view override returns (bytes4) {
        if (
            !(key.currency0 == currency0) || !(key.currency1 == currency1) || key.fee != fee
                || key.tickSpacing != tickSpacing
        ) revert PoolNotAllowed();
        return BaseHook.afterInitialize.selector;
    }

    /// @dev TODO: record sqrtPriceX96 before the swap in transient storage.
    function _beforeSwap(address, PoolKey calldata, SwapParams calldata, bytes calldata)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    /// @dev TODO: read the post-swap price P1 and the actual deltas, compute loss = dy - dx * P1,
    ///      return k * loss as a hook delta in the output token and mint it as ERC-6909 to the
    ///      pool's reserve. Direction and exact-in/exact-out must both be handled from the deltas.
    function _afterSwap(address, PoolKey calldata, SwapParams calldata, BalanceDelta, bytes calldata)
        internal
        override
        returns (bytes4, int128)
    {
        return (BaseHook.afterSwap.selector, 0);
    }

    /// @dev TODO: record or update the position's entry amounts (x0, y0) and entry reference
    ///      price Pe as a liquidity-weighted average. Key: (owner, tickLower, tickUpper, salt).
    function _afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) internal override returns (bytes4, BalanceDelta) {
        return (BaseHook.afterAddLiquidity.selector, BalanceDeltaLibrary.ZERO_DELTA);
    }

    /// @dev TODO: skip unless liquidityDelta < 0 (AV-01). Compute x0, y0, x1, y1 from the removed
    ///      liquidity at Pe and Px (AV-02), IL, and apply the coverage cap, value-based pro-rata
    ///      draw and minimum hold. Burn ERC-6909 from the reserve and return the payout as a hook
    ///      delta credited to the caller. Must never revert: oracle failure or an empty reserve
    ///      pays zero and removal proceeds.
    function _afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) internal override returns (bytes4, BalanceDelta) {
        return (BaseHook.afterRemoveLiquidity.selector, BalanceDeltaLibrary.ZERO_DELTA);
    }
}
