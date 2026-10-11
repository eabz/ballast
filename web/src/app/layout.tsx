import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";

import { Header } from "@/components/Header";

import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const mono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Ballast",
  description: "Swap and provide liquidity on a Uniswap v4 pool whose hook pays LPs back part of their impermanent loss.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Providers>
          <Header />
          <main className="flex flex-1 flex-col items-center px-4 pt-10 pb-16 sm:pt-16">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
