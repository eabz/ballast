"use client";

import { useAccount } from "wagmi";

import { useBallastPool } from "@/hooks/useBallastPool";
import { formatFee, formatNumber, shortAddress } from "@/lib/format";
import { spotPrice } from "@/lib/pool";

import { HookStatus } from "./HookStatus";
import { TierCard } from "./TierCard";
import { Card, Notice, Panel, Row, TokenIcon } from "./ui";

export function PoolOverview() {
  const { chain } = useAccount();
  const pool = useBallastPool();
  const { key, token0, token1, slot0 } = pool;
  const explorer = chain?.blockExplorers?.default.url;

  return (
    <div className="flex w-full max-w-[640px] flex-col gap-4">
      <div className="flex items-end justify-between px-1">
        <h1 className="text-3xl font-semibold tracking-tight">Pool</h1>
      </div>
      <HookStatus />

      <Card>
        <div className="flex items-center gap-3 px-3 pt-2 pb-4">
          <div className="flex -space-x-2">
            <TokenIcon symbol={token0?.symbol} size={36} />
            <TokenIcon symbol={token1?.symbol} size={36} />
          </div>
          <div className="text-xl font-semibold">
            {token0 && token1 ? `${token0.symbol} / ${token1.symbol}` : "—"}
          </div>
          {key && (
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-sm font-medium text-text-2">{formatFee(key.fee)}</span>
          )}
          <span className="ml-auto rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">v4 · Ballast</span>
        </div>

        <Panel>
          <Row label="Price">
            {slot0 && token0 && token1
              ? `${formatNumber(spotPrice(slot0.sqrtPriceX96, token0.decimals, token1.decimals), 6)} ${token1.symbol} per ${token0.symbol}`
              : "–"}
          </Row>
          <Row label="Current tick">{slot0 ? slot0.tick : "–"}</Row>
          <Row label="Active liquidity">{pool.liquidity !== undefined ? pool.liquidity.toLocaleString("en-US") : "–"}</Row>
          <Row label="Tick spacing">{key?.tickSpacing ?? "–"}</Row>
          <Row label="Hook">
            {pool.hook ? (
              explorer ? (
                <a className="text-accent hover:underline" href={`${explorer}/address/${pool.hook}`} target="_blank" rel="noreferrer">
                  {shortAddress(pool.hook)}
                </a>
              ) : (
                shortAddress(pool.hook)
              )
            ) : (
              "–"
            )}
          </Row>
          <Row label="Pool ID">
            <span className="font-mono text-xs">{pool.poolId ? shortAddress(pool.poolId) : "–"}</span>
          </Row>
        </Panel>
      </Card>

      <TierCard />

      <Card>
        <div className="px-3 pt-2 pb-3 text-lg font-semibold">Your positions</div>
        <Notice>
          Adding and removing liquidity from the app comes with the hook callbacks, since withdrawals are where Ballast pays out.
          Until then, use <code>script/02_AddLiquidity.s.sol</code>.
        </Notice>
      </Card>
    </div>
  );
}
