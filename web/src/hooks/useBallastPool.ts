"use client";

import { type Address, erc20Abi, hexToBigInt } from "viem";
import { useChainId, useReadContracts } from "wagmi";

import { getDeployment } from "@/config/contracts";
import { tierFor } from "@/config/tiers";
import { ballastHookAbi, poolManagerAbi } from "@/lib/abis";
import {
  type PoolKey,
  decodeLiquidity,
  decodeSlot0,
  isNative,
  poolId,
  poolLiquiditySlot,
  poolStateSlot,
} from "@/lib/pool";

export type Token = { address: Address; symbol: string; decimals: number };

const nativeToken = (address: Address): Token => ({ address, symbol: "ETH", decimals: 18 });

/** Reads the single pool this chain's BallastReserveHook serves, its state and its reserve. */
export function useBallastPool() {
  const chainId = useChainId();
  const deployment = getDeployment(chainId);
  const hook = deployment?.hook;

  const immutables = useReadContracts({
    allowFailure: false,
    query: { enabled: !!hook },
    contracts: (["currency0", "currency1", "fee", "tickSpacing", "k", "COVERAGE_CAP", "MIN_HOLD", "PRORATA_MULTIPLIER"] as const).map((functionName) => ({
      address: hook!,
      abi: ballastHookAbi,
      functionName,
    })),
  });

  const key: PoolKey | undefined =
    hook && immutables.data
      ? {
          currency0: immutables.data[0] as Address,
          currency1: immutables.data[1] as Address,
          fee: immutables.data[2] as number,
          tickSpacing: immutables.data[3] as number,
          hooks: hook,
        }
      : undefined;
  const id = key ? poolId(key) : undefined;

  const metadata = useReadContracts({
    query: { enabled: !!key },
    contracts: key
      ? [key.currency0, key.currency1].flatMap((address) => [
          { address, abi: erc20Abi, functionName: "symbol" } as const,
          { address, abi: erc20Abi, functionName: "decimals" } as const,
        ])
      : [],
  });

  const state = useReadContracts({
    query: { enabled: !!key && !!deployment, refetchInterval: 12_000 },
    contracts:
      key && id && deployment
        ? [
            { address: deployment.poolManager, abi: poolManagerAbi, functionName: "extsload", args: [poolStateSlot(id)] },
            { address: deployment.poolManager, abi: poolManagerAbi, functionName: "extsload", args: [poolLiquiditySlot(id)] },
            {
              address: deployment.poolManager,
              abi: poolManagerAbi,
              functionName: "balanceOf",
              args: [key.hooks, hexToBigInt(key.currency0)],
            },
            {
              address: deployment.poolManager,
              abi: poolManagerAbi,
              functionName: "balanceOf",
              args: [key.hooks, hexToBigInt(key.currency1)],
            },
          ]
        : [],
  });

  const tokenAt = (i: 0 | 1): Token | undefined => {
    if (!key) return undefined;
    const address = i === 0 ? key.currency0 : key.currency1;
    if (isNative(address)) return nativeToken(address);
    const symbol = metadata.data?.[i * 2]?.result;
    const decimals = metadata.data?.[i * 2 + 1]?.result;
    if (symbol === undefined || decimals === undefined) return undefined;
    return { address, symbol: symbol as string, decimals: decimals as number };
  };

  const k = immutables.data ? (immutables.data[4] as number) : undefined;
  const params = immutables.data
    ? {
        k: k!,
        tier: tierFor(k),
        coverageCap: (immutables.data[5] as number) / 1_000_000,
        minHoldSeconds: immutables.data[6] as number,
        prorataMultiplier: immutables.data[7] as number,
      }
    : undefined;

  const [slot0Word, liquidityWord, reserve0, reserve1] = state.data ?? [];
  const slot0 = slot0Word?.result ? decodeSlot0(slot0Word.result as `0x${string}`) : undefined;

  return {
    chainId,
    deployment,
    hook,
    key,
    poolId: id,
    token0: tokenAt(0),
    token1: tokenAt(1),
    /** Ballast parameters: the creator's tier plus the fixed constants. */
    params,
    slot0,
    // An uninitialized pool reads as sqrtPriceX96 == 0.
    initialized: slot0 ? slot0.sqrtPriceX96 > 0n : undefined,
    liquidity: liquidityWord?.result ? decodeLiquidity(liquidityWord.result as `0x${string}`) : undefined,
    reserve0: reserve0?.result as bigint | undefined,
    reserve1: reserve1?.result as bigint | undefined,
    isLoading: immutables.isLoading || metadata.isLoading || state.isLoading,
    error: immutables.error ?? metadata.error ?? state.error,
    refetch: () => state.refetch(),
  };
}
