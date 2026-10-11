# Ballast web

Next.js dapp for the Ballast pool. It targets Unichain Sepolia, Base Sepolia and Ethereum Sepolia, using wagmi, viem and RainbowKit.

| Route | Contents |
| --- | --- |
| `/` | Swap through the Hookmate V4 router, the one `script/03_Swap.s.sol` uses. |
| `/pool` | Pool key, price, tick and liquidity read from the PoolManager. Liquidity management lands with the hook callbacks. |
| `/reserve` | The hook's ERC-6909 reserve balances and the k, c, H, m parameters. |

## Setup

```bash
bun install
```

```bash
cp .env.example .env.local
```

Set `NEXT_PUBLIC_HOOK_<chainId>` to the hook address from `script/00_DeployHook.s.sol`. The app reads the PoolKey from the hook's immutables, so no other pool config is needed. `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` is optional; without it only browser wallets are offered.

```bash
bun dev
```

## Notes

- Uniswap v4 addresses in `src/config/contracts.ts` mirror `lib/hookmate/src/constants/AddressConstants.sol`.
- Swap output is a spot-price estimate net of the LP fee. It ignores price impact and the Ballast surcharge.
- The UI follows the usual DEX layout but uses its own palette, mark and copy. Don't add Uniswap logos, colours or names to the interface.
