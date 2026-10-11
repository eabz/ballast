// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {CurrencyLibrary, Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {LiquidityAmounts} from "@uniswap/v4-core/test/utils/LiquidityAmounts.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {Constants} from "@uniswap/v4-core/test/utils/Constants.sol";
import {CustomRevert} from "@uniswap/v4-core/src/libraries/CustomRevert.sol";

import {EasyPosm} from "./utils/libraries/EasyPosm.sol";
import {BaseTest} from "./utils/BaseTest.sol";

import {BaseHook} from "@openzeppelin/uniswap-hooks/src/base/BaseHook.sol";
import {SwapParams, ModifyLiquidityParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

import {BallastReserveHook, K_LIGHT, K_STANDARD, K_HEAVY} from "../src/BallastReserveHook.sol";

contract BallastReserveHookTest is BaseTest {
    using EasyPosm for IPositionManager;
    using PoolIdLibrary for PoolKey;
    using CurrencyLibrary for Currency;
    using StateLibrary for IPoolManager;

    /// @dev The seven flag bits the hook address must encode.
    uint160 constant FLAGS = uint160(
        Hooks.AFTER_INITIALIZE_FLAG | Hooks.AFTER_ADD_LIQUIDITY_FLAG | Hooks.AFTER_REMOVE_LIQUIDITY_FLAG
            | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
            | Hooks.AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA_FLAG
    );

    Currency currency0;
    Currency currency1;

    PoolKey poolKey;

    BallastReserveHook hook;
    PoolId poolId;

    uint256 tokenId;
    int24 tickLower;
    int24 tickUpper;

    function setUp() public {
        deployArtifactsAndLabel();

        (currency0, currency1) = deployCurrencyPair();

        // Deploy the hook to an address with the correct flags, namespaced to avoid collisions.
        address flags = address(FLAGS ^ (0x4444 << 144));
        bytes memory constructorArgs =
            abi.encode(poolManager, currency0, currency1, uint24(3000), int24(60), K_STANDARD);
        deployCodeTo("BallastReserveHook.sol:BallastReserveHook", constructorArgs, flags);
        hook = BallastReserveHook(flags);

        poolKey = PoolKey(currency0, currency1, 3000, 60, IHooks(hook));
        poolId = poolKey.toId();
        poolManager.initialize(poolKey, Constants.SQRT_PRICE_1_1);

        tickLower = TickMath.minUsableTick(poolKey.tickSpacing);
        tickUpper = TickMath.maxUsableTick(poolKey.tickSpacing);

        uint128 liquidityAmount = 100e18;

        (uint256 amount0Expected, uint256 amount1Expected) = LiquidityAmounts.getAmountsForLiquidity(
            Constants.SQRT_PRICE_1_1,
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            liquidityAmount
        );

        (tokenId,) = positionManager.mint(
            poolKey,
            tickLower,
            tickUpper,
            liquidityAmount,
            amount0Expected + 1,
            amount1Expected + 1,
            address(this),
            block.timestamp,
            Constants.ZERO_BYTES
        );
    }

    function test_permissionsMatchDesign() public view {
        Hooks.Permissions memory p = hook.getHookPermissions();
        assertTrue(p.afterInitialize);
        assertTrue(p.afterAddLiquidity);
        assertTrue(p.afterRemoveLiquidity);
        assertTrue(p.beforeSwap);
        assertTrue(p.afterSwap);
        assertTrue(p.afterSwapReturnDelta);
        assertTrue(p.afterRemoveLiquidityReturnDelta);

        assertFalse(p.beforeInitialize);
        assertFalse(p.beforeAddLiquidity);
        assertFalse(p.beforeRemoveLiquidity);
        assertFalse(p.beforeDonate);
        assertFalse(p.afterDonate);
        assertFalse(p.beforeSwapReturnDelta);
        assertFalse(p.afterAddLiquidityReturnDelta);

        assertEq(uint160(address(hook)) & Hooks.ALL_HOOK_MASK, FLAGS);
    }

    /// @dev Parameters are fixed per deployment: the chosen tier plus the backtested constants.
    function test_tierAndConstants() public view {
        assertEq(hook.k(), 500_000);
        assertEq(hook.COVERAGE_CAP(), 500_000);
        assertEq(hook.MIN_HOLD(), 24 hours);
        assertEq(hook.PRORATA_MULTIPLIER(), 3);
        assertEq(K_LIGHT, 300_000);
        assertEq(K_HEAVY, 700_000);
    }

    /// @dev AV-19: k outside the three tiers cannot be deployed.
    function test_invalidTierReverts() public {
        address other = address(FLAGS ^ (0x5555 << 144));
        bytes memory badArgs = abi.encode(poolManager, currency0, currency1, uint24(3000), int24(60), uint24(400_000));
        vm.etch(other, abi.encodePacked(vm.getCode("BallastReserveHook.sol:BallastReserveHook"), badArgs));
        (bool ok, bytes memory ret) = other.call("");
        assertFalse(ok);
        assertEq(bytes4(ret), BallastReserveHook.InvalidTier.selector);
    }

    /// @dev AV-19: a pool with any other fee or tick spacing cannot be initialized on the hook.
    function test_AV19_otherPoolKeyReverts() public {
        PoolKey memory otherFee = PoolKey(currency0, currency1, 500, 60, IHooks(hook));
        _expectPoolNotAllowed();
        poolManager.initialize(otherFee, Constants.SQRT_PRICE_1_1);

        PoolKey memory otherSpacing = PoolKey(currency0, currency1, 3000, 10, IHooks(hook));
        _expectPoolNotAllowed();
        poolManager.initialize(otherSpacing, Constants.SQRT_PRICE_1_1);
    }

    /// @dev AV-18: a second pool sharing a currency with the reserve cannot be created on the hook.
    function test_AV18_secondPoolSharingCurrencyReverts() public {
        (Currency fresh,) = deployCurrencyPair();
        (Currency c0, Currency c1) = currency0 < fresh ? (currency0, fresh) : (fresh, currency0);

        PoolKey memory otherPool = PoolKey(c0, c1, 3000, 60, IHooks(hook));
        _expectPoolNotAllowed();
        poolManager.initialize(otherPool, Constants.SQRT_PRICE_1_1);
    }

    /// @dev AV-24: every hook entrypoint rejects callers other than the PoolManager.
    function test_AV24_callbacksOnlyPoolManager() public {
        SwapParams memory swapParams = SwapParams(true, -1e18, TickMath.MIN_SQRT_PRICE + 1);
        ModifyLiquidityParams memory addParams = ModifyLiquidityParams(tickLower, tickUpper, 1e18, 0);
        ModifyLiquidityParams memory removeParams = ModifyLiquidityParams(tickLower, tickUpper, -1e18, 0);
        BalanceDelta zero = BalanceDelta.wrap(0);

        vm.expectRevert(BaseHook.NotPoolManager.selector);
        hook.afterInitialize(address(this), poolKey, Constants.SQRT_PRICE_1_1, 0);

        vm.expectRevert(BaseHook.NotPoolManager.selector);
        hook.beforeSwap(address(this), poolKey, swapParams, Constants.ZERO_BYTES);

        vm.expectRevert(BaseHook.NotPoolManager.selector);
        hook.afterSwap(address(this), poolKey, swapParams, zero, Constants.ZERO_BYTES);

        vm.expectRevert(BaseHook.NotPoolManager.selector);
        hook.afterAddLiquidity(address(this), poolKey, addParams, zero, zero, Constants.ZERO_BYTES);

        vm.expectRevert(BaseHook.NotPoolManager.selector);
        hook.afterRemoveLiquidity(address(this), poolKey, removeParams, zero, zero, Constants.ZERO_BYTES);
    }

    /// @dev The PoolManager wraps hook reverts; match the hook's PoolNotAllowed inside the wrapper.
    function _expectPoolNotAllowed() internal {
        vm.expectRevert(
            abi.encodeWithSelector(
                CustomRevert.WrappedError.selector,
                address(hook),
                IHooks.afterInitialize.selector,
                abi.encodeWithSelector(BallastReserveHook.PoolNotAllowed.selector),
                abi.encodeWithSelector(Hooks.HookCallFailed.selector)
            )
        );
    }

    function test_swapPassesThroughScaffold() public {
        uint256 amountIn = 1e18;
        BalanceDelta swapDelta = swapRouter.swapExactTokensForTokens({
            amountIn: amountIn,
            amountOutMin: 0,
            zeroForOne: true,
            poolKey: poolKey,
            hookData: Constants.ZERO_BYTES,
            receiver: address(this),
            deadline: block.timestamp + 1
        });

        assertEq(int256(swapDelta.amount0()), -int256(amountIn));
        assertGt(swapDelta.amount1(), 0);
    }

    /// @dev Invariant from the design: the hook never blocks liquidity removal.
    function test_removeLiquidityNeverBlocked() public {
        positionManager.decreaseLiquidity(tokenId, 1e18, 0, 0, address(this), block.timestamp, Constants.ZERO_BYTES);
    }
}
