# Parameters

Four numbers decide whether the economics work. All four are fixed by replaying real pool history, not by estimates; the backtest is tracked in the [roadmap](roadmap.md#backtest-plan).

| Parameter | Meaning | Starting range |
| --- | --- | --- |
| k | Ballast rate: share of each swap's loss collected | 0.1 – 0.3 |
| c | Coverage cap: max share of a position's IL reimbursed | 0.3 – 0.5 |
| H | Minimum hold before a claim is valid | 24 – 72 h |
| m | Pro-rata multiplier on a claim's liquidity share | 2 – 5 |

The price reference is a choice rather than a number: a Chainlink feed where one exists, otherwise the pool's own TWAP over at least 30 minutes.

All five are fixed in `afterInitialize` and feed the surcharge and payout as follows:

```mermaid
flowchart TD
    subgraph inputs["Fixed at afterInitialize"]
        k[k · ballast rate]
        c[c · coverage cap]
        H[H · minimum hold]
        m[m · pro-rata multiplier]
        O[oracle · Chainlink or long TWAP]
    end
    k --> SUR[Per-swap surcharge]
    SUR --> R[(Reserve)]
    O --> Pe[Pₑ at entry]
    O --> Px[Pₓ at exit]
    Pe --> IL[Realized IL]
    Px --> IL
    c --> PAY[Payout]
    H --> PAY
    m --> PAY
    IL --> PAY
    R --> PAY
```
