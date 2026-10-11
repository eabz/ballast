"""Rank v4 pools by recent swap activity and resolve their tokens, to pick backtest candidates."""

import argparse
from collections import Counter, defaultdict

from .config import CHAINS, INITIALIZE_TOPIC, SWAP_TOPIC
from .eth_utils_lite import to_int, words
from .rpc import Rpc

SYMBOL_SEL = "0x95d89b41"
DECIMALS_SEL = "0x313ce567"


def symbol(rpc, addr):
    if int(addr, 16) == 0:
        return "ETH", 18
    try:
        raw = rpc.call("eth_call", [{"to": addr, "data": SYMBOL_SEL}, "latest"])
        w = words(raw)
        if len(w) >= 3:
            n = int(w[1], 16)
            sym = bytes.fromhex("".join(w[2:]))[:n].decode("utf-8", "replace")
        else:
            sym = bytes.fromhex(w[0]).rstrip(b"\0").decode("utf-8", "replace")
        dec = int(rpc.call("eth_call", [{"to": addr, "data": DECIMALS_SEL}, "latest"]), 16)
        return sym, dec
    except Exception as e:
        return f"?{addr[:8]}", -1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chain", default="mainnet")
    ap.add_argument("--windows", type=int, default=6, help="sample windows spread over --span blocks")
    ap.add_argument("--window-blocks", type=int, default=2000)
    ap.add_argument("--span", type=int, default=1_300_000, help="~6 months on mainnet")
    ap.add_argument("--top", type=int, default=25)
    args = ap.parse_args()
    chain = CHAINS[args.chain]
    rpc = Rpc()
    head = rpc.block_number()
    counts, volume_hint = Counter(), defaultdict(float)
    first_seen = {}
    for w in range(args.windows):
        end = head - w * (args.span // args.windows)
        start = end - args.window_blocks
        logs = rpc.get_logs(chain.pool_manager, [SWAP_TOPIC], start, end)
        for l in logs:
            pid = l["topics"][1]
            counts[pid] += 1
            first_seen.setdefault(pid, 10**12)
        print(f"window {w + 1}/{args.windows} blocks {start}-{end}: {len(logs)} swaps", flush=True)
    top = counts.most_common(args.top)
    # resolve pool keys via Initialize events (scan in 10k chunks until all found)
    want = {pid for pid, _ in top}
    keys = {}
    for s in range(chain.v4_deploy_block, head + 1, 10_000):
        logs = rpc.get_logs(chain.pool_manager, [INITIALIZE_TOPIC], s, min(s + 9_999, head))
        for l in logs:
            pid = l["topics"][1]
            if pid in want and pid not in keys:
                wd = words(l["data"])
                keys[pid] = {
                    "c0": "0x" + l["topics"][2][-40:], "c1": "0x" + l["topics"][3][-40:],
                    "fee": int(wd[0], 16), "spacing": to_int(wd[1], 256), "hooks": "0x" + wd[2][-40:],
                    "block": int(l["blockNumber"], 16),
                }
        if len(keys) == len(want):
            break
    syms = {}
    print(f"\n{'swaps':>6} {'pair':<22} {'fee':>5} {'hook':<8} {'init block':>10} pool id")
    for pid, n in top:
        k = keys.get(pid)
        if not k:
            print(f"{n:>6} (no Initialize found) {pid}")
            continue
        for a in (k["c0"], k["c1"]):
            if a not in syms:
                syms[a] = symbol(rpc, a)
        pair = f"{syms[k['c0']][0]}/{syms[k['c1']][0]}"
        hook = "none" if int(k["hooks"], 16) == 0 else k["hooks"][:8]
        print(f"{n:>6} {pair:<22} {k['fee']:>5} {hook:<8} {k['block']:>10} {pid}")


if __name__ == "__main__":
    main()
