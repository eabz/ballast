import { type Address, type Hex, encodeAbiParameters, hexToBigInt, keccak256, zeroAddress } from "viem";

import { poolKeyAbiParameter } from "./abis";

export type PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

export const isNative = (currency: Address) => currency === zeroAddress;

export function poolId(key: PoolKey): Hex {
  return keccak256(encodeAbiParameters([poolKeyAbiParameter], [key]));
}

// Storage layout from v4-core StateLibrary: pools mapping at slot 6, liquidity at offset 3.
const POOLS_SLOT = 6n;
const LIQUIDITY_OFFSET = 3n;

export function poolStateSlot(id: Hex): Hex {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }], [id, POOLS_SLOT]));
}

export function poolLiquiditySlot(id: Hex): Hex {
  return `0x${(hexToBigInt(poolStateSlot(id)) + LIQUIDITY_OFFSET).toString(16).padStart(64, "0")}`;
}

export type Slot0 = { sqrtPriceX96: bigint; tick: number; protocolFee: number; lpFee: number };

export function decodeSlot0(word: Hex): Slot0 {
  const v = hexToBigInt(word);
  const rawTick = Number((v >> 160n) & 0xffffffn);
  return {
    sqrtPriceX96: v & ((1n << 160n) - 1n),
    tick: rawTick >= 0x800000 ? rawTick - 0x1000000 : rawTick,
    protocolFee: Number((v >> 184n) & 0xffffffn),
    lpFee: Number((v >> 208n) & 0xffffffn),
  };
}

export function decodeLiquidity(word: Hex): bigint {
  return hexToBigInt(word) & ((1n << 128n) - 1n);
}

/** Spot price as token1 per token0, adjusted for decimals. */
export function spotPrice(sqrtPriceX96: bigint, decimals0: number, decimals1: number): number {
  const ratio = Number(sqrtPriceX96) / 2 ** 96;
  return ratio * ratio * 10 ** (decimals0 - decimals1);
}
