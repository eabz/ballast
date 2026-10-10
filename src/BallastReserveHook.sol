// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {BalanceDelta, BalanceDeltaLibrary} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";

/// @title BallastReserveHook
/// @notice Uniswap v4 hook that collects a per-swap surcharge proportional to the loss a swap
///         imposes on LPs into a pool-owned ERC-6909 reserve, and pays LPs a capped, pro-rata share
///         of realized impermanent loss when they withdraw.
/// @dev Scaffold only. Every callback is a pass-through until the backtest fixes k, c, H and m.
///      Design: docs/design-logic.md. Per-callback behaviour: docs/03-hook-lifecycle.md.
contract BallastReserveHook is BaseHook {
    using PoolIdLibrary for PoolKey;

    constructor(IPoolManager _poolManager) BaseHook(_poolManager) {}

    /// @dev Five callbacks are enabled. afterSwap also returns a delta, so six flag bits are set.
    ///      The swap curve is untouched (no beforeSwapReturnDelta), which keeps the hook eligible
    ///      for interface routing.
    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: false,
            afterInitialize: true,
            beforeAddLiquidity: false,
            afterAddLiquidity: true,
            beforeRemoveLiquidity: true,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: false,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    // -----------------------------------------------------------------------
    // Lifecycle. See docs/03-hook-lifecycle.md for what each step must do.
    // -----------------------------------------------------------------------

    /// @dev TODO: store the pool's immutable parameters (k, c, H, m, oracle) and reject pools whose
    ///      reference asset has no oracle unless a TWAP fallback is configured.
    function _afterInitialize(address, PoolKey calldata, uint160, int24) internal override returns (bytes4) {
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

    /// @dev TODO: compute exit amounts and IL against the reference price Px, apply the coverage
    ///      cap, pro-rata draw, and minimum hold, then burn ERC-6909 from the reserve and take the
    ///      payout to the LP. Must never revert on an empty reserve: removal always proceeds.
    function _beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        internal
        override
        returns (bytes4)
    {
        return BaseHook.beforeRemoveLiquidity.selector;
    }
}
