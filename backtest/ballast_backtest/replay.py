"""Replay a pool's swap and liquidity history under the Ballast rules.

Units: token0 = ETH (18 dec), token1 = USDC (6 dec). Prices are USDC per ETH. All values are USDC.

Per swap:    loss = a0 * P1 + a1   (a0, a1 are the swapper's deltas; negative = paid). This nets the LP
             fee against the price-impact loss. loss_gross adds the fee back (pure LVR).
             surcharge = k * max(loss, 0), taken in the output token and credited to the reserve.
Per close:   IL = (x0 * Px + y0) - (x1 * Px + y1) against a 30-minute geometric TWAP of the pool.
             payout = min(c * IL, m * share * reserve) if IL > 0, hold >= H, reserve > 0.

Swaps only add to the reserve and closes only draw from it, so the surcharge stream is vectorised
per k and the sequential pass only visits liquidity events.
"""

import argparse
import itertools
import json
import os

import numpy as np
import pandas as pd

Q96 = 2.0**96
DEC0, DEC1 = 1e18, 1e6  # overwritten from initialize.json in main()
HOUR = 3600


def sqrt_from_tick(t):
    return 1.0001 ** (np.asarray(t, dtype=float) / 2)


def amounts_for_liquidity(L, sp, ta, tb):
    """Token amounts (ETH, USDC) held by liquidity L between ticks ta<tb at raw sqrt price sp."""
    sa, sb = sqrt_from_tick(ta), sqrt_from_tick(tb)
    if sp <= sa:
        x, y = L * (sb - sa) / (sa * sb), 0.0
    elif sp >= sb:
        x, y = 0.0, L * (sb - sa)
    else:
        x, y = L * (sb - sp) / (sp * sb), L * (sp - sa)
    return x / DEC0, y / DEC1


def load(root):
    global DEC0, DEC1
    swaps = pd.read_parquet(os.path.join(root, "swaps.parquet"))
    mods = pd.read_parquet(os.path.join(root, "mods.parquet"))
    blocks = pd.read_parquet(os.path.join(root, "blocks.parquet"))
    init = json.load(open(os.path.join(root, "initialize.json")))
    DEC0, DEC1 = 10.0 ** init.get("decimals0", 18), 10.0 ** init.get("decimals1", 6)
    for c in ("amount0", "amount1", "sqrt_price_x96", "liquidity"):
        swaps[c] = swaps[c].map(float)
    mods["liquidity_delta"] = mods["liquidity_delta"].map(float)
    ts = lambda b: np.interp(b, blocks["block"].values, blocks["timestamp"].values)
    swaps["t"] = ts(swaps["block"].values)
    mods["t"] = ts(mods["block"].values)
    return swaps, mods, init


def swap_metrics(swaps, numeraire="token1"):
    """All loss/notional columns are in token1 units; `cv` converts them to the chosen numeraire."""
    s = swaps
    sp = s["sqrt_price_x96"].values / Q96
    p1 = sp**2 * DEC0 / DEC1  # USDC per ETH after the swap
    a0 = s["amount0"].values / DEC0
    a1 = s["amount1"].values / DEC1
    zero_for_one = a0 < 0
    fee = s["fee"].values / 1e6
    fee_val = np.where(zero_for_one, -a0 * fee * p1, -a1 * fee)
    loss_net = a0 * p1 + a1
    loss_gross = loss_net + fee_val
    notional = np.where(zero_for_one, -a0 * p1, -a1)
    # A swap that empties the active range leaves the price at a tick boundary; P1 is meaningless there.
    # The hook must bound the surcharge by the swap's own output; here those swaps are excluded.
    drained = s["liquidity"].values == 0
    if drained.any():
        print(f"excluding {drained.sum()} swaps that drained the pool to zero liquidity")
        loss_net = np.where(drained, 0.0, loss_net)
        loss_gross = np.where(drained, 0.0, loss_gross)
        fee_val = np.where(drained, 0.0, fee_val)
        notional = np.where(drained, 0.0, notional)
    cv = 1.0 / p1 if numeraire == "token0" else np.ones_like(p1)
    return pd.DataFrame(
        {
            "cv": cv,
            "t": s["t"].values,
            "block": s["block"].values,
            "p1": p1,
            "sqrt_raw": sp,
            "tick": s["tick"].values,
            "active_liquidity": s["liquidity"].values,
            "zero_for_one": zero_for_one,
            "notional": notional,
            "fee_val": fee_val,
            "loss_net": loss_net,
            "loss_gross": loss_gross,
        }
    )


class Twap:
    """Geometric-mean TWAP from the tick path: tick is constant between swaps."""

    def __init__(self, t, tick, t0, tick0, window):
        self.t = np.concatenate([[t0], t])
        tk = np.concatenate([[tick0], tick])
        dt = np.diff(self.t, append=self.t[-1])
        self.cum = np.concatenate([[0.0], np.cumsum(tk[:-1] * dt[:-1])])
        self.tick = tk
        self.window = window

    def _cum_at(self, t):
        i = np.searchsorted(self.t, t, side="right") - 1
        i = max(i, 0)
        return self.cum[i] + self.tick[i] * (t - self.t[i])

    def price(self, t):
        w = self.window
        if t - w <= self.t[0]:
            return 1.0001 ** self.tick[max(np.searchsorted(self.t, t, side="right") - 1, 0)] * DEC0 / DEC1
        avg_tick = (self._cum_at(t) - self._cum_at(t - w)) / w
        return 1.0001**avg_tick * DEC0 / DEC1


def prepare_mods(sm, mods, twap, numeraire="token1"):
    """Per liquidity event: index of the last swap at or before it, and the reference price."""
    mods = mods[mods["liquidity_delta"] != 0].copy()
    mods["i"] = np.searchsorted(sm["t"].values, mods["t"].values, side="right") - 1
    mods["px"] = [twap.price(t) for t in mods["t"].values]
    p1 = sm["p1"].values
    spot = np.where(mods["i"].values >= 0, p1[np.maximum(mods["i"].values, 0)], np.nan)
    mods["cvm"] = 1.0 / spot if numeraire == "token0" else 1.0
    return mods


def simulate(sm, mods, init, k, c, H, m, loss_col, twap=None):
    """One scenario. Returns per-close rows and a summary. `mods` must come from prepare_mods."""
    loss = np.maximum(sm[loss_col].values, 0)
    surcharge = k * loss  # USDC value
    in1 = np.where(sm["zero_for_one"].values, surcharge, 0.0)  # output token USDC
    in0 = np.where(sm["zero_for_one"].values, 0.0, surcharge / sm["p1"].values)  # output token ETH
    cum0, cum1 = np.cumsum(in0), np.cumsum(in1)
    cv = sm["cv"].values
    sqrt_raw = sm["sqrt_raw"].values
    active = sm["active_liquidity"].values
    p1 = sm["p1"].values
    init_sqrt = init["sqrt_price_x96"] / Q96

    positions = {}
    out0 = out1 = 0.0
    rows = []
    for r in mods.itertuples(index=False):
        dL = r.liquidity_delta
        i = r.i
        sp = sqrt_raw[i] if i >= 0 else init_sqrt
        price = p1[i] if i >= 0 else init_sqrt**2 * DEC0 / DEC1
        key = (r.sender, r.tick_lower, r.tick_upper, r.salt)
        if dL > 0:
            x, y = amounts_for_liquidity(dL, sp, r.tick_lower, r.tick_upper)
            pos = positions.get(key)
            if pos is None:
                positions[key] = {"L": dL, "x0": x, "y0": y, "t_entry": r.t}
            else:
                tot = pos["L"] + dL
                pos["t_entry"] = (pos["t_entry"] * pos["L"] + r.t * dL) / tot
                pos["L"], pos["x0"], pos["y0"] = tot, pos["x0"] + x, pos["y0"] + y
            continue

        pos = positions.get(key)
        if pos is None or pos["L"] <= 0:
            continue
        rem = min(-dL, pos["L"])
        f = rem / pos["L"]
        x1, y1 = amounts_for_liquidity(rem, sp, r.tick_lower, r.tick_upper)
        x0, y0 = pos["x0"] * f, pos["y0"] * f
        px = r.px
        hold_value = x0 * px + y0
        il = hold_value - (x1 * px + y1)
        hold = r.t - pos["t_entry"]
        share = min(rem / active[i], 1.0) if i >= 0 and active[i] > 0 else 1.0

        res0 = (cum0[i] if i >= 0 else 0.0) - out0
        res1 = (cum1[i] if i >= 0 else 0.0) - out1
        reserve = max(res0 * price + res1, 0.0)
        claim = max(c * il, 0.0)
        eligible = il > 0 and hold >= H
        cap = m * share * reserve
        payout = min(claim, cap) if eligible else 0.0
        if payout > 0:
            frac = payout / reserve
            out0 += res0 * frac
            out1 += res1 * frac

        pos["L"] -= rem
        pos["x0"] -= x0
        pos["y0"] -= y0
        if pos["L"] <= 0:
            del positions[key]

        u = r.cvm
        rows.append(
            {
                "t": r.t,
                "il": il * u,
                "hold_value": hold_value * u,
                "hold_h": hold / HOUR,
                "share": share,
                "reserve_before": reserve * u,
                "claim": claim * u,
                "cap": cap * u,
                "payout": payout * u,
                "eligible": eligible,
            }
        )

    closes = pd.DataFrame(rows)
    final_res = ((cum0[-1] - out0) * p1[-1] + (cum1[-1] - out1)) * cv[-1]
    total_in = float(np.sum(surcharge * cv))
    losing = closes[closes["il"] > 0] if len(closes) else closes
    elig = closes[closes["eligible"]] if len(closes) else closes
    summary = {
        "k": k, "c": c, "H_h": H / HOUR, "m": m, "loss": loss_col,
        "surcharge_usdc": total_in,
        "final_reserve_usdc": final_res,
        "closes": len(closes),
        "losing_closes": len(losing),
        "eligible_closes": len(elig),
        "il_total_usdc": float(losing["il"].sum()) if len(losing) else 0.0,
        "claims_usdc": float(elig["claim"].sum()) if len(elig) else 0.0,
        "payouts_usdc": float(closes["payout"].sum()) if len(closes) else 0.0,
        "reserve_to_claims": total_in / elig["claim"].sum() if len(elig) and elig["claim"].sum() > 0 else np.inf,
        "made_whole_share": float((elig["payout"] >= elig["claim"] * 0.999).mean()) if len(elig) else np.nan,
        "paid_share": float((elig["payout"] > 0).mean()) if len(elig) else np.nan,
        "payout_to_claims": elig["payout"].sum() / elig["claim"].sum() if len(elig) and elig["claim"].sum() > 0 else np.nan,
    }
    return closes, summary


def splitting_analysis(sm, swaps, k):
    """AV-12. How much of the per-swap surcharge survives if the loss is measured per unlock (tx) or per
    block instead of per swap, and what rational splitting of large swaps into N pieces would do."""
    live = sm["notional"].values > 0  # rows zeroed by --skip-days drop out here too
    a0 = np.where(live, swaps["amount0"].values / DEC0, 0.0)
    a1 = np.where(live, swaps["amount1"].values / DEC1, 0.0)
    df = pd.DataFrame({"tx": swaps["tx"].values, "block": sm["block"].values, "a0": a0, "a1": a1,
                       "p1": sm["p1"].values, "fee_val": sm["fee_val"].values, "notional": sm["notional"].values})
    cv = sm["cv"].values
    df["cv"] = cv
    base_net = k * (np.maximum(sm["loss_net"].values, 0) * cv).sum()
    base_gross = k * (np.maximum(sm["loss_gross"].values, 0) * cv).sum()
    rows = []
    for name, keys in (("per swap", None), ("per tx (unlock)", ["tx"]), ("per block", ["block"])):
        if keys is None:
            rows.append({"measure": name, "surcharge_net": base_net, "surcharge_gross": base_gross, "groups": len(df)})
            continue
        g = df.groupby(keys, sort=False).agg(a0=("a0", "sum"), a1=("a1", "sum"), p1=("p1", "last"), fee=("fee_val", "sum"), cv=("cv", "last"))
        net = g["a0"] * g["p1"] + g["a1"]
        rows.append({"measure": name, "surcharge_net": k * (np.maximum(net, 0) * g["cv"]).sum(),
                     "surcharge_gross": k * (np.maximum(net + g["fee"], 0) * g["cv"]).sum(), "groups": len(g)})
    agg = pd.DataFrame(rows)
    agg["share_of_per_swap_net"] = agg["surcharge_net"] / base_net
    agg["share_of_per_swap_gross"] = agg["surcharge_gross"] / base_gross

    # Rational splitting: loss ~ size^2 for small moves, so N equal pieces pay ~1/N. Apply to swaps above a notional threshold.
    lg = np.maximum(sm["loss_gross"].values, 0) * cv
    n = sm["notional"].values * cv
    srows = []
    live = n > 0
    for q in (0.9, 0.99):
        thr = np.quantile(n[live], q)
        big = n >= thr
        for N in (2, 5, 10):
            kept = lg[~big].sum() + lg[big].sum() / N
            srows.append({"split_quantile": q, "threshold": thr, "N": N, "share_of_swaps_split": big.mean(),
                          "reserve_share_remaining": kept / lg.sum()})
    return agg, pd.DataFrame(srows)


def surcharge_stats(sm, k, loss_col):
    loss = np.maximum(sm[loss_col].values, 0)
    s = k * loss * sm["cv"].values
    n = sm["notional"].values * sm["cv"].values
    ok = n > 0
    s, n = s[ok], n[ok]
    bps = s / n * 1e4
    return {
        "k": k, "loss": loss_col,
        "surcharge_usdc": float(s.sum()),
        "bps_of_volume": float(s.sum() / n.sum() * 1e4),
        "median_trade_bps": float(np.median(bps)),
        "p90_trade_bps": float(np.percentile(bps, 90)),
        "share_paying": float((s > 0).mean()),
        "share_from_top1pct": float(np.sort(s)[-max(1, len(s) // 100):].sum() / s.sum()) if s.sum() > 0 else np.nan,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chain", default="mainnet")
    ap.add_argument("--fee", type=int, default=500)
    ap.add_argument("--name", default=None, help="data directory name (defaults to the fee tier)")
    ap.add_argument("--numeraire", default="token1", choices=("token0", "token1"), help="unit for all reported values")
    ap.add_argument("--unit", default=None, help="label for the numeraire, e.g. USDC or ETH")
    ap.add_argument("--k", default="0.1,0.2,0.3")
    ap.add_argument("--c", default="0.3,0.5")
    ap.add_argument("--H", default="24,72", help="hours")
    ap.add_argument("--m", default="2,3,5")
    ap.add_argument("--twap-min", type=float, default=30)
    ap.add_argument("--skip-days", type=float, default=0, help="ignore surcharges and closes in the first N days (launch liquidity is thin)")
    ap.add_argument("--out", default=None, help="directory for csv outputs")
    args = ap.parse_args()

    root = os.path.join(os.path.dirname(__file__), "..", "data", args.chain, args.name or str(args.fee))
    swaps, mods, init = load(root)
    sm = swap_metrics(swaps, args.numeraire)
    twap = Twap(sm["t"].values, sm["tick"].values, mods["t"].min() - 1, init["tick"], args.twap_min * 60)
    mods = prepare_mods(sm, mods, twap, args.numeraire)
    U = args.unit or ("USDC" if args.numeraire == "token1" else "ETH")
    cv = sm["cv"].values
    if args.skip_days:
        cutoff = sm["t"].min() + args.skip_days * 86400
        # Zero the surcharge stream before the cutoff but keep the price path and positions opened before it.
        for col in ("loss_net", "loss_gross", "notional", "fee_val"):
            sm.loc[sm["t"] < cutoff, col] = 0.0
        mods = mods[(mods["liquidity_delta"] > 0) | (mods["t"] >= cutoff)]
        print(f"skipping surcharges and closes before {pd.to_datetime(cutoff, unit='s'):%Y-%m-%d}")

    days = (sm["t"].max() - sm["t"].min()) / 86400
    vol = (sm["notional"] * cv).sum()
    M = 1e6 if args.numeraire == "token1" else 1.0
    Ms = "M" if args.numeraire == "token1" else ""
    print(f"period: {pd.to_datetime(sm['t'].min(), unit='s'):%Y-%m-%d} to {pd.to_datetime(sm['t'].max(), unit='s'):%Y-%m-%d} ({days:.0f} days)")
    print(f"swaps: {len(sm):,}  volume: {vol / M:,.1f}{Ms} {U}  liquidity events: {len(mods):,}")
    print(f"LP fees: {(sm['fee_val'] * cv).sum() / M:,.2f}{Ms} {U}  LVR gross: {(np.maximum(sm['loss_gross'], 0) * cv).sum() / M:,.2f}{Ms} {U}  "
          f"net-of-fee loss: {(np.maximum(sm['loss_net'], 0) * cv).sum() / M:,.2f}{Ms} {U}  share of swaps with net loss>0: {(sm['loss_net'] > 0).mean():.1%}")

    ks = [float(x) for x in args.k.split(",")]
    cs = [float(x) for x in args.c.split(",")]
    Hs = [float(x) * HOUR for x in args.H.split(",")]
    ms = [float(x) for x in args.m.split(",")]

    print("\n== Surcharge by k ==")
    ss = pd.DataFrame([surcharge_stats(sm, k, lc) for lc in ("loss_gross", "loss_net") for k in ks])
    print(ss.to_string(index=False, float_format=lambda v: f"{v:,.3f}"))

    print("\n== AV-12: loss measured per swap vs per unlock vs per block (k=%s) ==" % ks[0])
    agg, split = splitting_analysis(sm, swaps, ks[0])
    print(agg.to_string(index=False, float_format=lambda v: f"{v:,.3f}"))
    print("\n== AV-12: rational splitting of large swaps into N pieces (gross loss) ==")
    print(split.to_string(index=False, float_format=lambda v: f"{v:,.3f}"))

    print("\n== Scenarios ==")
    res, all_closes = [], None
    for lc, k, c, H, m in itertools.product(("loss_gross", "loss_net"), ks, cs, Hs, ms):
        closes, summ = simulate(sm, mods, init, k, c, H, m, lc, twap)
        res.append(summ)
        if all_closes is None:
            all_closes = closes
    rdf = pd.DataFrame(res)
    cols = ["loss", "k", "c", "H_h", "m", "surcharge_usdc", "claims_usdc", "payouts_usdc", "reserve_to_claims",
            "payout_to_claims", "made_whole_share", "paid_share", "final_reserve_usdc"]
    print(rdf[cols].to_string(index=False, float_format=lambda v: f"{v:,.3f}"))

    if all_closes is not None and len(all_closes):
        c = all_closes
        print("\n== Position closes (independent of scenario) ==")
        print(f"closes: {len(c):,}  with IL>0: {(c['il'] > 0).mean():.1%}  total IL on losers: {c.loc[c['il'] > 0, 'il'].sum() / M:,.2f}{Ms} {U}")
        print(f"IL as share of hold value, losers: median {np.median(c.loc[c['il'] > 0, 'il'] / c.loc[c['il'] > 0, 'hold_value']) * 1e4:,.0f} bps")
        print(f"hold time: median {c['hold_h'].median():.1f}h  share < 24h {(c['hold_h'] < 24).mean():.1%}  share < 72h {(c['hold_h'] < 72).mean():.1%}")

    if all_closes is not None and len(all_closes):
        print("\n== Monthly, first scenario (k=%s c=%s H=%sh m=%s, %s) ==" % (ks[0], cs[0], Hs[0] / HOUR, ms[0], "loss_gross"))
        k0 = ks[0]
        inflow = pd.Series(k0 * np.maximum(sm["loss_gross"].values, 0) * cv, index=pd.to_datetime(sm["t"], unit="s")).resample("MS").sum()
        volm = pd.Series(sm["notional"].values * cv, index=pd.to_datetime(sm["t"], unit="s")).resample("MS").sum()
        cl = all_closes.set_index(pd.to_datetime(all_closes["t"], unit="s"))
        monthly = pd.DataFrame({
            "volume": volm / M,
            "inflow_usdc": inflow,
            "claims_usdc": cl.loc[cl["eligible"], "claim"].resample("MS").sum(),
            "payouts_usdc": cl["payout"].resample("MS").sum(),
            "closes": cl["il"].resample("MS").count(),
        }).fillna(0)
        monthly["inflow_to_claims"] = monthly["inflow_usdc"] / monthly["claims_usdc"].replace(0, np.nan)
        monthly.index = monthly.index.strftime("%Y-%m")
        print(monthly.to_string(float_format=lambda v: f"{v:,.2f}"))

    if args.out:
        os.makedirs(args.out, exist_ok=True)
        monthly.to_csv(os.path.join(args.out, "monthly.csv"))
        agg.to_csv(os.path.join(args.out, "av12_aggregation.csv"), index=False)
        split.to_csv(os.path.join(args.out, "av12_splitting.csv"), index=False)
        ss.to_csv(os.path.join(args.out, "surcharge.csv"), index=False)
        rdf.to_csv(os.path.join(args.out, "scenarios.csv"), index=False)
        all_closes.to_csv(os.path.join(args.out, "closes_first_scenario.csv"), index=False)


if __name__ == "__main__":
    main()
