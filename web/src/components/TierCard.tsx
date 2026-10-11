"use client";

import { tiers } from "@/config/tiers";
import { useBallastPool } from "@/hooks/useBallastPool";

import { Card, Panel, Row } from "./ui";

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Shows which ballast-rate tier this pool's creator chose and what it means for swappers and LPs. */
export function TierCard() {
  const { params } = useBallastPool();
  if (!params) return null;
  const { tier } = params;

  return (
    <Card>
      <div className="flex items-center justify-between px-3 pt-2 pb-3">
        <div className="text-lg font-semibold">Ballast tier</div>
        <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent">
          {tier ? `${tier.name} · k ${tier.rate}` : `k ${params.k / 1_000_000}`}
        </span>
      </div>

      <div className="mb-2 grid grid-cols-3 gap-2 px-1">
        {tiers.map((t) => {
          const active = t.k === params.k;
          return (
            <div
              key={t.k}
              className={`rounded-2xl border px-3 py-2 text-center text-sm ${
                active ? "border-accent bg-accent-soft text-accent" : "border-border text-text-3"
              }`}
            >
              <div className="font-semibold">{t.name}</div>
              <div className="text-xs">k {t.rate}</div>
            </div>
          );
        })}
      </div>

      {tier && (
        <Panel>
          <p className="pb-2 text-sm text-text-2">{tier.blurb}</p>
          <Row label="Surcharge on a typical trade">{tier.medianTradeBps} bps</Row>
          <Row label="Surcharge on a large trade">{tier.p90TradeBps} bps</Row>
          <Row label="Share of LP loss the reserve funds">~{pct(tier.ilFundedShare)}</Row>
          <Row label="Losing LPs paid in full">{pct(tier.claimsPaidInFull)}</Row>
          <Row label="Max rebate per position">{pct(params.coverageCap)} of IL</Row>
          <Row label="Minimum hold">{Math.round(params.minHoldSeconds / 3600)} h</Row>
          <p className="pt-2 text-xs text-text-3">
            Figures from the mainnet ETH/USDC 0.05% backtest. The surcharge is paid by swappers in proportion to the
            price impact of their trade, so small trades pay almost nothing.
          </p>
        </Panel>
      )}
    </Card>
  );
}
