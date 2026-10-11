import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  rainbowWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http } from "wagmi";
import { baseSepolia, sepolia, unichainSepolia } from "wagmi/chains";

import { supportedChains } from "./contracts";

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

// WalletConnect-backed wallets need a project ID; without one, fall back to browser wallets.
const connectors = connectorsForWallets(
  projectId
    ? [
        { groupName: "Popular", wallets: [metaMaskWallet, rabbyWallet, coinbaseWallet, rainbowWallet] },
        { groupName: "More", wallets: [walletConnectWallet, injectedWallet] },
      ]
    : [{ groupName: "Browser", wallets: [injectedWallet, coinbaseWallet] }],
  { appName: "Ballast", projectId: projectId ?? "unset" },
);

export const wagmiConfig = createConfig({
  chains: supportedChains,
  connectors,
  ssr: true,
  transports: {
    [unichainSepolia.id]: http(process.env.NEXT_PUBLIC_RPC_1301),
    [baseSepolia.id]: http(process.env.NEXT_PUBLIC_RPC_84532),
    [sepolia.id]: http(process.env.NEXT_PUBLIC_RPC_11155111),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
