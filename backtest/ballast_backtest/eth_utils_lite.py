"""Minimal ABI helpers so the package has no web3 dependency."""

from ._keccak import keccak_256


def keccak(data: bytes) -> str:
    return "0x" + keccak_256(data).hex()


def _addr(a: str) -> bytes:
    return bytes.fromhex(a[2:].rjust(64, "0"))


def _uint(v: int) -> bytes:
    return v.to_bytes(32, "big")


def _int(v: int) -> bytes:
    return (v & ((1 << 256) - 1)).to_bytes(32, "big")


def encode_pool_key(c0: str, c1: str, fee: int, tick_spacing: int, hooks: str) -> bytes:
    return _addr(c0) + _addr(c1) + _uint(fee) + _int(tick_spacing) + _addr(hooks)


def event_topic(signature: str) -> str:
    return keccak(signature.encode())


def to_int(word: str, bits: int) -> int:
    v = int(word, 16)
    if v >= 1 << (bits - 1):
        v -= 1 << bits
    return v


def words(data_hex: str):
    d = data_hex[2:]
    return [d[i : i + 64] for i in range(0, len(d), 64)]
