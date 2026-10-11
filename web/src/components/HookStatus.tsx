"use client";

import { useAccount } from "wagmi";

import { supportedChains } from "@/config/contracts";
import { useBallastPool } from "@/hooks/useBallastPool";

import { Notice } from "./ui";

/** Explains why the pool is unavailable on the current network, or renders nothing. */
export function HookStatus() {
  const { isConnected, chain } = useAccount();
  const { chainId, hook, error, initialized } = useBallastPool();

  if (isConnected && !chain) {
    return (
      <Notice tone="warning">
        Unsupported network. Switch to {supportedChains.map((c) => c.name).join(", ")}.
      </Notice>
    );
  }
  if (!hook) {
    const name = supportedChains.find((c) => c.id === chainId)?.name ?? `chain ${chainId}`;
    return (
      <Notice tone="warning">
        No Ballast hook is configured for {name}. Deploy it with <code>script/00_DeployHook.s.sol</code> and set{" "}
        <code>NEXT_PUBLIC_HOOK_{chainId}</code> in <code>web/.env.local</code>.
      </Notice>
    );
  }
  if (error) return <Notice tone="warning">Could not read the hook: {error.message.split("\n")[0]}</Notice>;
  if (initialized === false) {
    return <Notice tone="warning">The Ballast pool is not initialized yet. Run <code>script/01_CreatePoolAndAddLiquidity.s.sol</code>.</Notice>;
  }
  return null;
}
