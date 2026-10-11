# Glossary

| Term | Meaning |
| --- | --- |
| **Ballast rate (k)** | Fraction of each swap's imposed loss collected as surcharge. 0 < k < 1. |
| **Coverage cap (c)** | Maximum fraction of a position's realized IL that is reimbursed. |
| **Minimum hold (H)** | Time a position must stay open before a claim is valid. |
| **Pro-rata multiplier (m)** | Multiplier on a claim's value share; bounds one claim's draw on the reserve. |
| **Reserve** | Pool-owned balance of ERC-6909 claims on the PoolManager, funded by surcharges and drawn by payouts. |
| **Surcharge** | k · (Δy − Δx · P₁), taken in `afterSwap` in the unspecified currency. |
| **Impermanent loss (IL)** | Value of a position at exit versus the value of simply holding the deposited amounts, measured over the position's life. |
| **Loss-versus-rebalancing (LVR)** | The same loss measured against continuous rebalancing. Approximated by Δy − Δx · P₁ summed per block, not per swap (AV-28). |
| **Reference price** | Chainlink feed, with the hook's own ≥ 30 min TWAP as fallback and cross-check, used for Pₑ and Pₓ. Never spot. |
| **Pₑ, Pₓ** | Reference price at position entry and exit, token1 per token0. |
| **P₀, P₁** | Pool price before and after a swap, token1 per token0. |
| **x₀, y₀** | Token0 and token1 amounts recorded at entry. |
| **x₁, y₁** | Token0 and token1 amounts returned at exit. |
| **Δx, Δy** | Token0 sold and token1 received in a swap, from the actual balance deltas. |
| **Position key** | (owner, tickLower, tickUpper, salt), as in v4. |
| **AV-nn** | Attack vector ID in [06-attack-vectors.md](06-attack-vectors.md). |
| **ERC-6909** | Multi-token claim standard the PoolManager uses for internal balances. |
| **`vanillaSwap`** | Hook property: the swap curve is unmodified. |
| **`BallastReserveHook`** | The contract. |
