# Glossary

| Term | Meaning |
| --- | --- |
| **Ballast rate (k)** | Fraction of each swap's imposed loss collected as surcharge. 0 < k < 1. |
| **Coverage cap (c)** | Maximum fraction of a position's realized IL that is reimbursed. |
| **Minimum hold (H)** | Time a position must stay open before a claim is valid. |
| **Pro-rata multiplier (m)** | Multiplier on a claim's liquidity share that bounds how much of the reserve one claim can draw. |
| **Reserve** | Pool-owned balance of ERC-6909 claims on the PoolManager, funded by surcharges and drawn by payouts. |
| **Surcharge** | k · (Δy − Δx · P₁), taken in the output token in `afterSwap`. |
| **Impermanent loss (IL)** | Value of a position at exit versus the value of simply holding the deposited amounts, measured over the position's life. |
| **Loss-versus-rebalancing (LVR)** | The same loss measured swap by swap. Sum over swaps of Δy − Δx · P₁. |
| **Reference price** | Chainlink feed or long-window TWAP used for Pₑ and Pₓ. Never spot. |
| **Pₑ, Pₓ** | Reference price at position entry and exit, token1 per token0. |
| **P₀, P₁** | Pool price before and after a swap, token1 per token0. |
| **x₀, y₀** | Token0 and token1 amounts recorded at entry. |
| **x₁, y₁** | Token0 and token1 amounts returned at exit. |
| **Δx, Δy** | Token0 sold and token1 received in a swap, from the actual balance deltas. |
| **Position key** | (owner, tickLower, tickUpper, salt), identical to v4's. |
| **ERC-6909** | Multi-token claim standard the PoolManager uses for internal balances. |
| **`vanillaSwap`** | Hook property: the swap curve is unmodified, keeping the hook eligible for interface routing. |
| **`BallastReserveHook`** | The contract name. `BallastHook` is taken by an unrelated registry entry. |
