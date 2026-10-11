"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useMemo, useState } from "react";
import { type Address, type Hash, erc20Abi, formatUnits, parseUnits } from "viem";
import { useAccount, useBalance, useConfig, useReadContract, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";

import { type Token, useBallastPool } from "@/hooks/useBallastPool";
import { swapRouterAbi } from "@/lib/abis";
import { formatAmount, formatFee, formatNumber } from "@/lib/format";
import { isNative, spotPrice } from "@/lib/pool";

import { HookStatus } from "./HookStatus";
import { Card, Panel, PrimaryButton, Row, TokenPill } from "./ui";

const SLIPPAGE_OPTIONS = [0.5, 1, 3];
const DEADLINE_SECONDS = 20 * 60;

function useTokenBalance(token: Token | undefined, owner: Address | undefined) {
  const native = useBalance({ address: owner, query: { enabled: !!owner && !!token && isNative(token.address) } });
  const erc20 = useReadContract({
    address: token?.address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: owner ? [owner] : undefined,
    query: { enabled: !!owner && !!token && !isNative(token.address) },
  });
  const isNativeToken = token ? isNative(token.address) : false;
  return {
    value: isNativeToken ? native.data?.value : erc20.data,
    refetch: () => (isNativeToken ? native.refetch() : erc20.refetch()),
  };
}

function parseAmount(value: string, decimals: number | undefined): bigint | undefined {
  if (!value || decimals === undefined) return undefined;
  try {
    return parseUnits(value, decimals);
  } catch {
    return undefined;
  }
}

export function SwapCard() {
  const { address, isConnected, chain } = useAccount();
  const pool = useBallastPool();
  const [zeroForOne, setZeroForOne] = useState(true);
  const [input, setInput] = useState("");
  const [slippage, setSlippage] = useState(1);

  const tokenIn = zeroForOne ? pool.token0 : pool.token1;
  const tokenOut = zeroForOne ? pool.token1 : pool.token0;
  const amountIn = parseAmount(input, tokenIn?.decimals);

  const balanceIn = useTokenBalance(tokenIn, address);
  const balanceOut = useTokenBalance(tokenOut, address);

  const router = pool.deployment?.swapRouter;
  const needsAllowance = !!tokenIn && !isNative(tokenIn.address);
  const allowance = useReadContract({
    address: tokenIn?.address,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && router ? [address, router] : undefined,
    query: { enabled: needsAllowance && !!address && !!router },
  });

  // Spot-price estimate net of the LP fee. Ignores price impact and the Ballast surcharge.
  const price =
    pool.slot0 && pool.token0 && pool.token1
      ? spotPrice(pool.slot0.sqrtPriceX96, pool.token0.decimals, pool.token1.decimals)
      : undefined;
  const estimatedOut = useMemo(() => {
    if (!amountIn || !price || !tokenIn || !tokenOut || !pool.key) return undefined;
    const inUnits = Number(formatUnits(amountIn, tokenIn.decimals));
    const out = (zeroForOne ? inUnits * price : inUnits / price) * (1 - pool.key.fee / 1e6);
    return Number.isFinite(out) ? out : undefined;
  }, [amountIn, price, tokenIn, tokenOut, zeroForOne, pool.key]);
  const minOut =
    estimatedOut !== undefined && tokenOut
      ? parseAmount((estimatedOut * (1 - slippage / 100)).toFixed(tokenOut.decimals), tokenOut.decimals)
      : undefined;

  const config = useConfig();
  const { writeContractAsync, isPending: isSigning, error: writeError } = useWriteContract();
  const [pendingAction, setPendingAction] = useState<"approve" | "swap">();
  const [lastTx, setLastTx] = useState<Hash>();

  const busy = isSigning || pendingAction !== undefined;
  const insufficient = amountIn !== undefined && balanceIn.value !== undefined && amountIn > balanceIn.value;
  const approvalNeeded = needsAllowance && amountIn !== undefined && (allowance.data ?? 0n) < amountIn;

  async function submit(kind: "approve" | "swap", send: () => Promise<Hash>) {
    setPendingAction(kind);
    try {
      const hash = await send();
      setLastTx(hash);
      await waitForTransactionReceipt(config, { hash });
      if (kind === "swap") setInput("");
      allowance.refetch();
      balanceIn.refetch();
      balanceOut.refetch();
      pool.refetch();
    } catch {
      // Rejections and reverts surface through writeError.
    } finally {
      setPendingAction(undefined);
    }
  }

  const approve = () => {
    if (!tokenIn || !router || !amountIn) return;
    submit("approve", () =>
      writeContractAsync({ address: tokenIn.address, abi: erc20Abi, functionName: "approve", args: [router, amountIn] }),
    );
  };

  const swap = () => {
    if (!router || !pool.key || !amountIn || minOut === undefined || !address || !tokenIn) return;
    const key = pool.key;
    submit("swap", () =>
      writeContractAsync({
        address: router,
        abi: swapRouterAbi,
        functionName: "swapExactTokensForTokens",
        args: [amountIn, minOut, zeroForOne, key, "0x", address, BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS)],
        value: isNative(tokenIn.address) ? amountIn : undefined,
      }),
    );
  };

  const ready = !!pool.key && pool.initialized === true && !!tokenIn && !!tokenOut;

  let action: React.ReactNode;
  if (!isConnected) {
    action = (
      <ConnectButton.Custom>
        {({ openConnectModal }) => (
          <PrimaryButton variant="soft" onClick={openConnectModal}>
            Connect wallet
          </PrimaryButton>
        )}
      </ConnectButton.Custom>
    );
  } else if (!chain) {
    action = (
      <ConnectButton.Custom>
        {({ openChainModal }) => <PrimaryButton onClick={openChainModal}>Switch network</PrimaryButton>}
      </ConnectButton.Custom>
    );
  } else if (!ready) {
    action = <PrimaryButton disabled>Pool unavailable</PrimaryButton>;
  } else if (!amountIn) {
    action = <PrimaryButton disabled>Enter an amount</PrimaryButton>;
  } else if (insufficient) {
    action = <PrimaryButton disabled>Insufficient {tokenIn.symbol} balance</PrimaryButton>;
  } else if (approvalNeeded) {
    action = (
      <PrimaryButton disabled={busy} onClick={approve}>
        {pendingAction === "approve" ? "Approving…" : `Approve ${tokenIn.symbol}`}
      </PrimaryButton>
    );
  } else {
    action = (
      <PrimaryButton disabled={busy || minOut === undefined} onClick={swap}>
        {busy ? "Swapping…" : "Swap"}
      </PrimaryButton>
    );
  }

  const setMax = () => {
    if (balanceIn.value === undefined || !tokenIn) return;
    setInput(formatUnits(balanceIn.value, tokenIn.decimals));
  };

  return (
    <div className="flex w-full max-w-[480px] flex-col gap-3">
      <HookStatus />
      <Card>
        <div className="flex items-center justify-between px-3 pt-1 pb-3">
          <span className="rounded-full bg-surface-2 px-3 py-1.5 text-[15px] font-medium">Swap</span>
          <SlippageControl value={slippage} onChange={setSlippage} />
        </div>

        <div className="relative flex flex-col gap-1">
          <Panel>
            <div className="text-sm text-text-2">Sell</div>
            <div className="mt-2 flex items-center gap-3">
              <input
                type="number"
                inputMode="decimal"
                placeholder="0"
                min="0"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="w-full min-w-0 bg-transparent text-4xl font-medium outline-none placeholder:text-text-3"
              />
              <TokenPill symbol={tokenIn?.symbol} />
            </div>
            <div className="mt-2 flex h-5 items-center justify-end gap-2 text-sm text-text-2">
              {tokenIn && balanceIn.value !== undefined && (
                <>
                  <span>
                    {formatAmount(balanceIn.value, tokenIn.decimals)} {tokenIn.symbol}
                  </span>
                  <button type="button" onClick={setMax} className="rounded-md bg-surface-3 px-1.5 text-xs font-semibold text-text-2 hover:text-text">
                    Max
                  </button>
                </>
              )}
            </div>
          </Panel>

          <button
            type="button"
            aria-label="Flip direction"
            onClick={() => {
              setZeroForOne((v) => !v);
              setInput(estimatedOut !== undefined ? String(Number(estimatedOut.toPrecision(8))) : "");
            }}
            className="absolute top-1/2 left-1/2 z-10 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl border-4 border-surface bg-surface-2 text-text-2 transition-colors hover:text-text"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M6 13l6 6 6-6" />
            </svg>
          </button>

          <Panel>
            <div className="text-sm text-text-2">Buy</div>
            <div className="mt-2 flex items-center gap-3">
              <div className={`w-full min-w-0 truncate text-4xl font-medium ${estimatedOut ? "" : "text-text-3"}`}>
                {estimatedOut !== undefined ? formatNumber(estimatedOut, 6) : "0"}
              </div>
              <TokenPill symbol={tokenOut?.symbol} />
            </div>
            <div className="mt-2 flex h-5 items-center justify-end text-sm text-text-2">
              {tokenOut && balanceOut.value !== undefined && (
                <span>
                  {formatAmount(balanceOut.value, tokenOut.decimals)} {tokenOut.symbol}
                </span>
              )}
            </div>
          </Panel>
        </div>

        <div className="mt-2">{action}</div>

        {ready && price !== undefined && pool.key && (
          <div className="px-3 pt-3 pb-1">
            <Row label="Price">
              1 {pool.token0!.symbol} = {formatNumber(price, 6)} {pool.token1!.symbol}
            </Row>
            <Row label="LP fee">{formatFee(pool.key.fee)}</Row>
            <Row label="Minimum received">
              {minOut !== undefined && tokenOut ? `${formatAmount(minOut, tokenOut.decimals)} ${tokenOut.symbol}` : "–"}
            </Row>
            <Row label="Ballast surcharge">Not active yet</Row>
          </div>
        )}

        {writeError && (
          <p className="px-3 pt-2 pb-1 text-sm break-words text-critical">{writeError.message.split("\n")[0]}</p>
        )}
      </Card>

      <p className="px-2 text-center text-xs text-text-3">
        Output is estimated from the spot price and ignores price impact. The swap reverts if it would receive less than the
        minimum.
      </p>
      {lastTx && chain?.blockExplorers && (
        <a
          className="text-center text-sm text-accent hover:underline"
          href={`${chain.blockExplorers.default.url}/tx/${lastTx}`}
          target="_blank"
          rel="noreferrer"
        >
          View transaction
        </a>
      )}
    </div>
  );
}

function SlippageControl({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1 text-sm">
      <span className="mr-1 text-text-2">Slippage</span>
      {SLIPPAGE_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`rounded-full px-2.5 py-1 font-medium transition-colors ${
            value === option ? "bg-accent-soft text-accent" : "text-text-2 hover:bg-surface-2"
          }`}
        >
          {option}%
        </button>
      ))}
    </div>
  );
}
