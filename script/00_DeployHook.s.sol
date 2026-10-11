// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {HookMiner} from "@uniswap/v4-periphery/src/utils/HookMiner.sol";

import {BaseScript} from "./base/BaseScript.sol";

import {BallastReserveHook, K_LIGHT, K_STANDARD, K_HEAVY} from "../src/BallastReserveHook.sol";

/// @notice Mines the address and deploys the BallastReserveHook contract
contract DeployHookScript is BaseScript {
    function run() public {
        // Hook contracts must have specific flags encoded in the address.
        uint160 flags = uint160(
            Hooks.AFTER_INITIALIZE_FLAG | Hooks.AFTER_ADD_LIQUIDITY_FLAG | Hooks.AFTER_REMOVE_LIQUIDITY_FLAG
                | Hooks.BEFORE_SWAP_FLAG | Hooks.AFTER_SWAP_FLAG | Hooks.AFTER_SWAP_RETURNS_DELTA_FLAG
                | Hooks.AFTER_REMOVE_LIQUIDITY_RETURNS_DELTA_FLAG
        );

        // Mine a salt that will produce a hook address with the correct flags.
        // One hook per pool (AV-18, AV-19): must match the key in 01_CreatePoolAndAddLiquidity.
        uint24 lpFee = 3000;
        int24 tickSpacing = 60;
        // Ballast-rate tier chosen by the pool creator: K_LIGHT (0.3), K_STANDARD (0.5) or K_HEAVY (0.7).
        uint24 k = uint24(vm.envOr("BALLAST_K", uint256(K_STANDARD)));
        require(k == K_LIGHT || k == K_STANDARD || k == K_HEAVY, "BALLAST_K must be 300000, 500000 or 700000");
        bytes memory constructorArgs = abi.encode(poolManager, currency0, currency1, lpFee, tickSpacing, k);
        (address hookAddress, bytes32 salt) =
            HookMiner.find(CREATE2_FACTORY, flags, type(BallastReserveHook).creationCode, constructorArgs);

        vm.startBroadcast();
        BallastReserveHook hook =
            new BallastReserveHook{salt: salt}(poolManager, currency0, currency1, lpFee, tickSpacing, k);
        vm.stopBroadcast();

        require(address(hook) == hookAddress, "DeployHookScript: Hook Address Mismatch");
    }
}
