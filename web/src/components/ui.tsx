import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`w-full rounded-3xl border border-border bg-surface p-2 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.12)] ${className}`}>
      {children}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[20px] bg-surface-2 p-4 ${className}`}>{children}</div>;
}

export function TokenPill({ symbol }: { symbol?: string }) {
  return (
    <span className="flex shrink-0 items-center gap-2 rounded-full border border-border bg-surface py-1 pr-3 pl-1 text-lg font-semibold">
      <TokenIcon symbol={symbol} />
      {symbol ?? "—"}
    </span>
  );
}

/** Deterministic initial-letter badge; no third-party token logos. */
export function TokenIcon({ symbol, size = 28 }: { symbol?: string; size?: number }) {
  const hue = [...(symbol ?? "?")].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span
      className="flex items-center justify-center rounded-full text-xs font-bold text-white"
      style={{ width: size, height: size, background: `hsl(${hue} 55% 45%)` }}
    >
      {(symbol ?? "?").slice(0, 1)}
    </span>
  );
}

export function Row({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-text-2">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warning"; children: ReactNode }) {
  const styles = tone === "warning" ? "bg-warning/10 text-warning" : "bg-accent-soft text-accent";
  return <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${styles}`}>{children}</div>;
}

export const primaryButton =
  "w-full rounded-[20px] py-4 text-lg font-semibold transition-colors disabled:cursor-not-allowed";

export function PrimaryButton({
  children,
  disabled,
  onClick,
  variant = "solid",
}: {
  children: ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  variant?: "solid" | "soft";
}) {
  const style = disabled
    ? "bg-surface-3 text-text-3"
    : variant === "soft"
      ? "bg-accent-soft text-accent hover:brightness-95"
      : "bg-accent text-accent-contrast hover:bg-accent-hover";
  return (
    <button type="button" className={`${primaryButton} ${style}`} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
