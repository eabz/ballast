"""Fetch Initialize, Swap and ModifyLiquidity events for one pool into parquet files.

Resumable: each 10k-block chunk is cached under data/<chain>/<fee>/chunks/ and skipped on rerun.
Block timestamps are sampled every SAMPLE_EVERY blocks via batched eth_getBlockByNumber and
interpolated later; that keeps the request count small and the error under a minute.
"""

import argparse
import json
import os
import sys
import time

import pandas as pd

from .config import CHAINS, INITIALIZE_TOPIC, MODIFY_LIQUIDITY_TOPIC, SWAP_TOPIC, eth_usdc_pool_id
from .eth_utils_lite import to_int, words
from .rpc import Rpc

CHUNK = 10_000
SAMPLE_EVERY = 1_000
BATCH = 50


def decode_swap(log):
    w = words(log["data"])
    return {
        "block": int(log["blockNumber"], 16),
        "log_index": int(log["logIndex"], 16),
        "tx": log["transactionHash"],
        "sender": "0x" + log["topics"][2][-40:],
        "amount0": to_int(w[0], 256),
        "amount1": to_int(w[1], 256),
        "sqrt_price_x96": int(w[2], 16),
        "liquidity": int(w[3], 16),
        "tick": to_int(w[4], 256),
        "fee": int(w[5], 16),
    }


def decode_modify(log):
    w = words(log["data"])
    return {
        "block": int(log["blockNumber"], 16),
        "log_index": int(log["logIndex"], 16),
        "tx": log["transactionHash"],
        "sender": "0x" + log["topics"][2][-40:],
        "tick_lower": to_int(w[0], 256),
        "tick_upper": to_int(w[1], 256),
        "liquidity_delta": to_int(w[2], 256),
        "salt": "0x" + w[3],
    }


def decode_initialize(log):
    w = words(log["data"])
    return {
        "block": int(log["blockNumber"], 16),
        "currency0": "0x" + log["topics"][2][-40:],
        "currency1": "0x" + log["topics"][3][-40:],
        "fee": int(w[0], 16),
        "tick_spacing": to_int(w[1], 256),
        "hooks": "0x" + w[2][-40:],
        "sqrt_price_x96": int(w[3], 16),
        "tick": to_int(w[4], 256),
    }


def fetch_chunk(rpc: Rpc, chain, pool_id: str, start: int, end: int, path: str):
    if os.path.exists(path):
        raw = json.load(open(path))
    else:
        raw = {
            "start": start,
            "end": end,
            "swaps": rpc.get_logs(chain.pool_manager, [SWAP_TOPIC, pool_id], start, end),
            "mods": rpc.get_logs(chain.pool_manager, [MODIFY_LIQUIDITY_TOPIC, pool_id], start, end),
        }
        tmp = path + ".tmp"
        json.dump(raw, open(tmp, "w"))
        os.replace(tmp, path)
    return {"swaps": [decode_swap(l) for l in raw["swaps"]], "mods": [decode_modify(l) for l in raw["mods"]]}


def find_initialize(rpc: Rpc, chain, pool_id: str, start: int, head: int):
    for s in range(start, head + 1, CHUNK):
        logs = rpc.get_logs(chain.pool_manager, [INITIALIZE_TOPIC, pool_id], s, min(s + CHUNK - 1, head))
        if logs:
            return decode_initialize(logs[0])
    raise SystemExit("pool Initialize event not found")


def sample_timestamps(rpc: Rpc, start: int, end: int, path: str):
    have = {}
    if os.path.exists(path):
        df = pd.read_parquet(path)
        have = dict(zip(df["block"], df["timestamp"]))
    blocks = [b for b in range(start - start % SAMPLE_EVERY, end + SAMPLE_EVERY, SAMPLE_EVERY) if b not in have]
    blocks.append(end) if end not in have else None
    for i in range(0, len(blocks), BATCH):
        chunk = blocks[i : i + BATCH]
        res = rpc.batch([("eth_getBlockByNumber", [hex(b), False]) for b in chunk])
        for b, r in zip(chunk, res):
            have[b] = int(r["timestamp"], 16)
        print(f"timestamps {min(i + BATCH, len(blocks))}/{len(blocks)}", end="\r", flush=True)
    df = pd.DataFrame({"block": sorted(have), "timestamp": [have[b] for b in sorted(have)]})
    df.to_parquet(path, index=False)
    return df


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--chain", default="mainnet", choices=CHAINS)
    ap.add_argument("--fee", type=int, default=500)
    ap.add_argument("--to-block", type=int, default=None)
    ap.add_argument("--max-chunks", type=int, default=None, help="stop after N chunks (smoke test)")
    ap.add_argument("--reverse", action="store_true", help="fetch chunks newest-first; run alongside a forward worker")
    args = ap.parse_args()

    chain = CHAINS[args.chain]
    pool_id = eth_usdc_pool_id(chain, args.fee)
    rpc = Rpc()
    assert rpc.chain_id() == chain.chain_id, "RPC chain id does not match --chain"
    head = args.to_block or rpc.block_number()

    root = os.path.join(os.path.dirname(__file__), "..", "data", chain.name, str(args.fee))
    os.makedirs(os.path.join(root, "chunks"), exist_ok=True)
    print(f"pool {pool_id} on {chain.name}, head {head}")

    init_path = os.path.join(root, "initialize.json")
    if os.path.exists(init_path):
        init = json.load(open(init_path))
    else:
        init = find_initialize(rpc, chain, pool_id, chain.v4_deploy_block, head)
        json.dump(init, open(init_path, "w"))
    print(f"initialized at block {init['block']} sqrtPrice {init['sqrt_price_x96']}")

    starts = list(range(init["block"], head + 1, CHUNK))
    if args.max_chunks:
        starts = starts[: args.max_chunks]
    swaps, mods = [], []
    t0 = time.time()
    for i, s in enumerate(reversed(starts) if args.reverse else starts):
        e = min(s + CHUNK - 1, head)
        c = fetch_chunk(rpc, chain, pool_id, s, e, os.path.join(root, "chunks", f"{s}.json"))
        swaps += c["swaps"]
        mods += c["mods"]
        print(f"chunk {i + 1}/{len(starts)} blocks {s}-{e} swaps={len(swaps)} mods={len(mods)} {time.time() - t0:.0f}s", flush=True)

    if args.reverse:
        return  # the forward worker assembles the parquet files once every chunk is cached
    last = min(starts[-1] + CHUNK - 1, head)
    sample_timestamps(rpc, init["block"], last, os.path.join(root, "blocks.parquet"))
    swap_cols = ["block", "log_index", "tx", "sender", "amount0", "amount1", "sqrt_price_x96", "liquidity", "tick", "fee"]
    mod_cols = ["block", "log_index", "tx", "sender", "tick_lower", "tick_upper", "liquidity_delta", "salt"]
    # Values wider than int64 are stored as decimal strings and parsed in replay.
    big_swap = {"amount0", "amount1", "sqrt_price_x96", "liquidity"}
    big_mod = {"liquidity_delta"}
    swaps = [{k: (str(v) if k in big_swap else v) for k, v in r.items()} for r in swaps]
    mods = [{k: (str(v) if k in big_mod else v) for k, v in r.items()} for r in mods]
    sdf = pd.DataFrame(swaps, columns=swap_cols).sort_values(["block", "log_index"])
    mdf = pd.DataFrame(mods, columns=mod_cols).sort_values(["block", "log_index"])
    sdf.to_parquet(os.path.join(root, "swaps.parquet"), index=False)
    mdf.to_parquet(os.path.join(root, "mods.parquet"), index=False)
    print(f"\nwrote {len(swaps)} swaps and {len(mods)} liquidity events to {os.path.abspath(root)}")


if __name__ == "__main__":
    sys.exit(main())
