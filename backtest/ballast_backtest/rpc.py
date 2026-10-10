"""Thin JSON-RPC client with retries and batching."""

import os
import time

import httpx
from dotenv import load_dotenv


class Rpc:
    def __init__(self, url: str | None = None, timeout: float = 120.0):
        load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
        load_dotenv()
        self.url = url or os.environ["BASE_RPC_URL"]
        self.client = httpx.Client(timeout=timeout)
        self._id = 0

    def _post(self, payload):
        for attempt in range(8):
            try:
                r = self.client.post(self.url, json=payload)
                r.raise_for_status()
                return r.json()
            except (httpx.HTTPError, ValueError) as e:
                wait = min(2**attempt, 30)
                print(f"rpc error {e!r}; retry in {wait}s")
                time.sleep(wait)
        raise RuntimeError("rpc: too many failures")

    def call(self, method: str, params: list):
        self._id += 1
        res = self._post({"jsonrpc": "2.0", "id": self._id, "method": method, "params": params})
        if "error" in res:
            raise RuntimeError(f"{method}: {res['error']}")
        return res["result"]

    def batch(self, calls: list[tuple[str, list]]):
        payload = []
        for method, params in calls:
            self._id += 1
            payload.append({"jsonrpc": "2.0", "id": self._id, "method": method, "params": params})
        res = self._post(payload)
        by_id = {r["id"]: r for r in res}
        out = []
        for p in payload:
            r = by_id[p["id"]]
            if "error" in r:
                raise RuntimeError(f"{p['method']}: {r['error']}")
            out.append(r["result"])
        return out

    def block_number(self) -> int:
        return int(self.call("eth_blockNumber", []), 16)

    def chain_id(self) -> int:
        return int(self.call("eth_chainId", []), 16)

    def get_logs(self, address: str, topics: list, from_block: int, to_block: int):
        return self.call(
            "eth_getLogs",
            [{"address": address, "topics": topics, "fromBlock": hex(from_block), "toBlock": hex(to_block)}],
        )
