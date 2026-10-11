// Minimal ABIs for the calls the app makes. Regenerate from `forge build` output in ../out
// once the hook exposes more state.

export const ballastHookAbi = [
  { type: "function", name: "currency0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "currency1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "fee", stateMutability: "view", inputs: [], outputs: [{ type: "uint24" }] },
  { type: "function", name: "tickSpacing", stateMutability: "view", inputs: [], outputs: [{ type: "int24" }] },
  // Parameters: k is the tier chosen at deployment; the rest are constants.
  { type: "function", name: "k", stateMutability: "view", inputs: [], outputs: [{ type: "uint24" }] },
  { type: "function", name: "COVERAGE_CAP", stateMutability: "view", inputs: [], outputs: [{ type: "uint24" }] },
  { type: "function", name: "MIN_HOLD", stateMutability: "view", inputs: [], outputs: [{ type: "uint32" }] },
  { type: "function", name: "PRORATA_MULTIPLIER", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
] as const;

export const poolManagerAbi = [
  {
    type: "function",
    name: "extsload",
    stateMutability: "view",
    inputs: [{ name: "slot", type: "bytes32" }],
    outputs: [{ type: "bytes32" }],
  },
  // ERC-6909 claims: the hook's balance is the pool's reserve.
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "id", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
] as const;

const poolKeyComponents = [
  { name: "currency0", type: "address" },
  { name: "currency1", type: "address" },
  { name: "fee", type: "uint24" },
  { name: "tickSpacing", type: "int24" },
  { name: "hooks", type: "address" },
] as const;

export const poolKeyAbiParameter = { type: "tuple", components: poolKeyComponents } as const;

// Single-pool exact-in overload of the Hookmate IUniswapV4Router04.
export const swapRouterAbi = [
  {
    type: "function",
    name: "swapExactTokensForTokens",
    stateMutability: "payable",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "zeroForOne", type: "bool" },
      { name: "poolKey", type: "tuple", components: poolKeyComponents },
      { name: "hookData", type: "bytes" },
      { name: "receiver", type: "address" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "delta", type: "int256" }],
  },
] as const;
