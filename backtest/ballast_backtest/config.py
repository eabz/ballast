"""Chain and pool constants. Pool ids are keccak256(abi.encode(PoolKey))."""

from dataclasses import dataclass

from .eth_utils_lite import keccak, encode_pool_key, event_topic

ZERO = "0x0000000000000000000000000000000000000000"


@dataclass(frozen=True)
class Chain:
    name: str
    chain_id: int
    pool_manager: str
    usdc: str
    v4_deploy_block: int
    position_manager: str


CHAINS = {
    "mainnet": Chain(
        name="mainnet",
        chain_id=1,
        pool_manager="0x000000000004444c5dc75cB358380D2e3dE08A90",
        usdc="0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        v4_deploy_block=21_688_329,
        position_manager="0xbD216513d74C8cf14cf4747E6AaA6420FF64ee9e",
    ),
    "base": Chain(
        name="base",
        chain_id=8453,
        pool_manager="0x498581fF718922c3f8e6A244956aF099B2652b2b",
        usdc="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        v4_deploy_block=25_350_988,
        position_manager="0x7C5f5A4bBd8fD63184577525326123B519429bDc",
    ),
}

TICK_SPACING_FOR_FEE = {100: 1, 500: 10, 3000: 60, 10000: 200}


def eth_usdc_pool_id(chain: Chain, fee: int) -> str:
    """Native ETH / USDC pool with no hook."""
    return keccak(encode_pool_key(ZERO, chain.usdc, fee, TICK_SPACING_FOR_FEE[fee], ZERO))


# Event signatures from v4-core IPoolManager.
SWAP_TOPIC = event_topic("Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)")
MODIFY_LIQUIDITY_TOPIC = event_topic("ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)")
INITIALIZE_TOPIC = event_topic("Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)")
