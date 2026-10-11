import { type Address, getAddress, isAddress } from "viem";
import { baseSepolia, sepolia, unichainSepolia } from "wagmi/chains";

export const supportedChains = [unichainSepolia, baseSepolia, sepolia] as const;

export type SupportedChainId = (typeof supportedChains)[number]["id"];

type Deployment = {
  poolManager: Address;
  positionManager: Address;
  /** Hookmate V4 router, the same one script/03_Swap.s.sol uses. */
  swapRouter: Address;
  /** BallastReserveHook for this chain, from NEXT_PUBLIC_HOOK_<chainId>. Undefined until deployed. */
  hook?: Address;
};

export const permit2: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3";

// Each env var is referenced literally so Next.js can inline it at build time.
function hookFromEnv(value: string | undefined): Address | undefined {
  return value && isAddress(value) ? getAddress(value) : undefined;
}

// Uniswap v4 addresses mirror lib/hookmate/src/constants/AddressConstants.sol.
export const deployments: Record<SupportedChainId, Deployment> = {
  [unichainSepolia.id]: {
    poolManager: "0x00B036B58a818B1BC34d502D3fE730Db729e62AC",
    positionManager: "0xf969Aee60879C54bAAed9F3eD26147Db216Fd664",
    swapRouter: "0x9cD2b0a732dd5e023a5539921e0FD1c30E198Dba",
    hook: hookFromEnv(process.env.NEXT_PUBLIC_HOOK_1301),
  },
  [baseSepolia.id]: {
    poolManager: "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408",
    positionManager: "0x4B2C77d209D3405F41a037Ec6c77F7F5b8e2ca80",
    swapRouter: "0x71cD4Ea054F9Cb3D3BF6251A00673303411A7DD9",
    hook: hookFromEnv(process.env.NEXT_PUBLIC_HOOK_84532),
  },
  [sepolia.id]: {
    poolManager: "0xE03A1074c86CFeDd5C142C4F04F1a1536e203543",
    positionManager: "0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4",
    swapRouter: "0xf13D190e9117920c703d79B5F33732e10049b115",
    hook: hookFromEnv(process.env.NEXT_PUBLIC_HOOK_11155111),
  },
};

export function getDeployment(chainId: number | undefined): Deployment | undefined {
  return chainId === undefined ? undefined : deployments[chainId as SupportedChainId];
}
