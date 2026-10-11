"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "./Logo";

const tabs = [
  { href: "/", label: "Swap" },
  { href: "/pool", label: "Pool" },
  { href: "/reserve", label: "Reserve" },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 flex h-[72px] items-center gap-1 px-4 sm:gap-3 backdrop-blur sm:px-6">
      <Link href="/" className="flex items-center gap-2 pr-2">
        <Logo />
        <span className="hidden text-lg font-semibold tracking-tight sm:inline">Ballast</span>
      </Link>

      <nav className="flex items-center sm:gap-1">
        {tabs.map(({ href, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`rounded-xl px-2 py-2 text-sm font-medium transition-colors sm:px-3 sm:text-[15px] ${
                active ? "text-text" : "text-text-2 hover:text-text"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap">
        <span className="hidden rounded-full bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning md:inline">
          Testnet
        </span>
        <ConnectButton chainStatus="icon" showBalance={false} accountStatus={{ smallScreen: "avatar", largeScreen: "full" }} />
      </div>
    </header>
  );
}
