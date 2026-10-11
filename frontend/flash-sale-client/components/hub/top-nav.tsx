"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";

import type { HubUser } from "@/lib/hub-api";
import { Badge, BrandMark, Button } from "./ui";

/** Layer 3: the nav is the one persistent liquid-glass surface; content scrolls beneath it. */
export function TopNav({ user, onSignOut }: { user: HubUser | null; onSignOut: () => void }) {
  return (
    <header className="sticky top-3 z-40 mx-3 sm:mx-6">
      <nav
        aria-label="Primary"
        className="glass-overlay mx-auto flex h-16 max-w-[1440px] items-center gap-6 rounded-2xl px-4 sm:px-6"
      >
        <BrandMark />
        <span className="hidden h-6 w-px bg-white/10 sm:block" aria-hidden />
        <span className="hidden font-mono text-[11px] uppercase tracking-[0.18em] text-ink-muted sm:block">
          Liquidation Hub
        </span>
        <Link
          href="/inventory"
          aria-current="page"
          className="ml-2 hidden rounded-lg px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-brand md:block"
        >
          Inventory
        </Link>

        <div className="ml-auto flex items-center gap-3">
          {user?.is_demo && <Badge tone="brand">Demo</Badge>}
          {user && (
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-medium text-ink">{user.display_name ?? user.email}</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-subtle">{user.role}</p>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={onSignOut} aria-label="Sign out">
            <LogOut className="size-4" aria-hidden />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </nav>
    </header>
  );
}
