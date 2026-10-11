/** Ballast mark: a hull keel over a waterline. */
export function Logo({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--accent)" />
      <path d="M7 12.5c2 1.2 4 1.2 6 0s4-1.2 6 0 4 1.2 6 0" stroke="var(--accent-contrast)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M8 16.5h16l-3.5 5.5h-9z" fill="var(--accent-contrast)" />
      <path d="M16 22v4" stroke="var(--accent-contrast)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
