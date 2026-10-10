# Diagrams

All diagrams are Mermaid flowcharts, which are directed acyclic graphs. GitHub, VS Code and most Markdown viewers render them inline. To export SVGs, run `npx -y @mermaid-js/mermaid-cli -i docs/diagrams.md -o docs/assets/diagrams.svg` (downloads a headless browser on first run).

## 1. System overview: two lanes, one reserve

```mermaid
flowchart LR
    subgraph swap["Swap lane · every swap"]
        S[Swapper] --> PM[PoolManager]
        PM --> AS["afterSwap<br/>loss = Δy − Δx·P₁"]
        AS --> SUR["surcharge = k · loss<br/>(output token)"]
    end
    SUR --> R[("Pool reserve<br/>ERC-6909 claims")]
    subgraph lp["LP lane · position close"]
        LP[LP] --> RM[removeLiquidity]
        RM --> BR["beforeRemoveLiquidity<br/>IL = (x₀Pₓ + y₀) − (x₁Pₓ + y₁)"]
        BR --> PAY["payout = min(c·IL, m·share·reserve)"]
    end
    R --> PAY
    PAY --> LP
```

## 2. Swap lane

```mermaid
flowchart TD
    A[Swap submitted] --> B["beforeSwap<br/>store sqrtPriceX96 in transient storage"]
    B --> C["Swap executes on unmodified curve"]
    C --> D["afterSwap<br/>read P₁ and balance deltas Δx, Δy"]
    D --> E["loss = Δy − Δx · P₁"]
    E --> F{loss > 0?}
    F -- no --> G[Return zero delta]
    F -- yes --> H["surcharge = k · loss"]
    H --> I["Return hook delta in output token"]
    I --> J["Mint ERC-6909 to pool reserve"]
    J --> K[Swap settles]
    G --> K
```

Direction and exact-in/exact-out mode do not matter: the loss term is computed from the actual deltas in both cases.

## 3. Payout decision

```mermaid
flowchart TD
    A[removeLiquidity called] --> B["beforeRemoveLiquidity"]
    B --> C["Scale recorded x₀, y₀ by fraction withdrawn"]
    C --> D["Read exit amounts x₁, y₁ and reference price Pₓ"]
    D --> E["IL = (x₀·Pₓ + y₀) − (x₁·Pₓ + y₁)"]
    E --> F{IL > 0?}
    F -- no --> Z[No payout]
    F -- yes --> G{"held ≥ H?"}
    G -- no --> Z
    G -- yes --> H{reserve > 0?}
    H -- no --> Z
    H -- yes --> I["cap = m · liquidityShare · reserve"]
    I --> J["payout = min(c · IL, cap)"]
    J --> K["Burn ERC-6909 from reserve<br/>take to LP inside unlock"]
    K --> L[Update position record]
    Z --> L
    L --> M[Liquidity removal proceeds]
```

Every path ends in the removal proceeding. The hook never blocks withdrawal.

## 4. Position record lifecycle

```mermaid
flowchart LR
    N[No record] -- "afterAddLiquidity<br/>store x₀, y₀, Pₑ, t₀" --> O[Open record]
    O -- "afterAddLiquidity<br/>liquidity-weighted average entry" --> O2[Open record, updated]
    O2 -. same state .-> O
    O -- "beforeRemoveLiquidity (partial)<br/>scale x₀, y₀; keep remainder" --> P[Open record, reduced]
    P -. same state .-> O
    O -- "beforeRemoveLiquidity (full)<br/>clear" --> N
```

Dotted edges mark that the node is the same state drawn twice for readability. Key: (owner, tickLower, tickUpper, salt).

## 5. Parameter dependencies

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

## 6. Delivery dependencies

```mermaid
flowchart LR
    D[Documentation layer] --> B["Backtest<br/>Base ETH/USDC"]
    B --> P["Fix k, c, H, m"]
    P --> S["Scaffold BallastReserveHook<br/>mine address for 5 flags"]
    S --> U["Unit tests<br/>both directions, exact-in/out,<br/>partial removals, empty reserve"]
    U --> F["Fork test<br/>live Base pool, replayed swaps"]
    F --> T["Testnet deploy<br/>Unichain Sepolia"]
    T --> REG[Registry submission]
    T --> RT[Routing allowlist form]
```
