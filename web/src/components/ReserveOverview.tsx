"use client";

import { useBallastPool } from "@/hooks/useBallastPool";
import { formatAmount } from "@/lib/format";

import { HookStatus } from "./HookStatus";
import { Card, Notice, Panel, Row, TokenIcon } from "./ui";

// Symbols follow docs/glossary.md. Values are fixed by the backtest (docs/roadmap.md).
const parameters = [
  { symbol: "k", name: "Ballast rate", detail: "Share of each swap's LP loss collected into the reserve" },
  { symbol: "c", name: "Coverage cap", detail: "Maximum share of realized IL paid back" },
  { symbol: "H", name: "Minimum hold", detail: "Time a position must be held before it can claim" },
  { symbol: "m", name: "Pro-rata multiplier", detail: "Scales an LP's share of the reserve" },
];

export function ReserveOverview() {
  const { token0, token1, reserve0, reserve1 } = useBallastPool();

  return (
    <div className="flex w-full max-w-[640px] flex-col gap-4">
      <h1 className="px-1 text-3xl font-semibold tracking-tight">Reserve</h1>
      <HookStatus />

      <Card>
        <div className="px-3 pt-2 pb-1 text-lg font-semibold">Balances</div>
        <p className="px-3 pb-3 text-sm text-text-2">
          ERC-6909 claims the hook holds on the PoolManager. No admin can withdraw them; they only leave as LP payouts.
        </p>
        <div className="grid gap-1 sm:grid-cols-2">
          {[
            { token: token0, value: reserve0 },
            { token: token1, value: reserve1 },
          ].map(({ token, value }, i) => (
            <Panel key={i} className="flex items-center gap-3">
              <TokenIcon symbol={token?.symbol} size={36} />
              <div>
                <div className="text-2xl font-semibold">{token ? formatAmount(value, token.decimals) : "–"}</div>
                <div className="text-sm text-text-2">{token?.symbol ?? "—"}</div>
              </div>
            </Panel>
          ))}
        </div>
      </Card>

      <Card>
        <div className="px-3 pt-2 pb-3 text-lg font-semibold">Parameters</div>
        <Panel>
          {parameters.map((p) => (
            <Row
              key={p.symbol}
              label={
                <span>
                  <span className="font-mono text-text">{p.symbol}</span> · {p.name}
                  <span className="block text-xs text-text-3">{p.detail}</span>
                </span>
              }
            >
              <span className="text-text-3">Pending backtest</span>
            </Row>
          ))}
        </Panel>
        <div className="mt-2">
          <Notice>The current hook passes swaps through without a surcharge, so the reserve stays empty until the callbacks ship.</Notice>
        </div>
      </Card>
    </div>
  );
}
