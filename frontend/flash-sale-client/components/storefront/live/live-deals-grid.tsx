"use client";

import { Flame } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { Badge } from "@/components/hub/ui";
import { cn } from "@/lib/utils";
import {
  LIQUIDATION_CATEGORIES,
  type LiquidationCategory,
  type LiquidationItem,
} from "@/lib/live-stream/inventory-data";
import { useLiveMarketplace } from "@/lib/live-stream/use-live-marketplace";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Simulated deals grid: stock, status and viewer counts update as orders stream in. */
export function LiveDealsGrid() {
  const { items, events, viewers } = useLiveMarketplace();
  const [category, setCategory] = useState<LiquidationCategory | "All">("All");
  const latest = events[0];
  const shown = category === "All" ? items : items.filter((item) => item.category === category);

  return (
    <>
      <div role="group" aria-label="Filter by category" className="mt-6 flex flex-wrap gap-2">
        {(["All", ...LIQUIDATION_CATEGORIES] as const).map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={category === name}
            onClick={() => setCategory(name)}
            className={cn(
              "rounded-lg border px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-wider transition-colors",
              category === name
                ? "border-brand/50 bg-brand-tint text-brand"
                : "border-line text-ink-muted hover:text-ink",
            )}
          >
            {name}
          </button>
        ))}
      </div>

      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((item) => (
          <DealCard
            key={item.id}
            item={item}
            viewers={viewers[item.id] ?? 0}
            flashKey={latest?.itemId === item.id ? latest.id : undefined}
          />
        ))}
      </ul>
    </>
  );
}

function DealCard({ item, viewers, flashKey }: { item: LiquidationItem; viewers: number; flashKey?: string }) {
  const soldOut = item.status === "Sold Out";
  const low = item.status === "Low Stock";
  const claimed = Math.round(((item.initialStock - item.currentStock) / item.initialStock) * 100);

  return (
    <li className="surface-data relative flex flex-col overflow-hidden rounded-2xl">
      {/* Remounts on each order for this item, replaying a brief amber flash over the card. */}
      {flashKey && (
        <span
          key={flashKey}
          aria-hidden
          className="pointer-events-none absolute inset-0 z-10 rounded-2xl motion-safe:animate-stock-flash"
        />
      )}

      <div className="relative">
        <Image
          src={item.imageUrl}
          alt=""
          width={400}
          height={300}
          unoptimized
          className={cn("aspect-[4/3] w-full object-cover transition-[filter,opacity] duration-500", soldOut && "opacity-40 grayscale")}
        />
        <span className="absolute left-3 top-3 rounded-lg bg-brand px-2 py-0.5 font-mono text-xs font-bold text-on-brand">
          -{item.discountPercentage}%
        </span>
        <span className="absolute right-3 top-3">
          <Badge tone={soldOut ? "danger" : low ? "signal" : "success"}>{item.status}</Badge>
        </span>
        {soldOut && (
          <span className="absolute inset-0 grid place-items-center">
            <span className="-rotate-12 rounded-lg border-2 border-danger px-4 py-1 font-display text-2xl font-bold tracking-[0.2em] text-danger motion-safe:animate-sold-out">
              SOLD OUT
            </span>
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">
          {item.category}
        </span>
        <h3 className="mt-1.5 font-semibold text-ink">{item.title}</h3>

        <div className="mt-3 flex items-baseline gap-2">
          <span className={cn("font-display text-2xl font-bold", soldOut ? "text-ink-subtle" : "text-brand")}>
            {usd.format(item.liquidationPrice)}
          </span>
          <span className="text-sm text-ink-subtle line-through">{usd.format(item.originalRetailPrice)}</span>
        </div>

        <div className="mt-auto space-y-2 pt-5">
          <div className="flex items-center justify-between font-mono text-xs">
            <span
              className={cn(
                soldOut ? "font-semibold text-danger" : low ? "font-semibold text-signal" : "text-ink-muted",
              )}
            >
              {soldOut ? "Sold out" : low ? `Only ${item.currentStock} left in stock!` : `${item.currentStock} in stock`}
            </span>
            <span className="text-ink-subtle">{claimed}% claimed</span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-sunken"
            role="progressbar"
            aria-label={`${item.title}: ${claimed}% claimed`}
            aria-valuenow={claimed}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={cn("h-full rounded-full transition-[width] duration-700", soldOut ? "bg-danger" : low ? "bg-signal" : "bg-brand")}
              style={{ width: `${claimed}%` }}
            />
          </div>
          <p className={cn("flex items-center gap-1.5 text-xs text-ink-muted", (soldOut || viewers === 0) && "invisible")}>
            <Flame className="size-3.5 text-brand" aria-hidden />
            {viewers} people viewing this deal right now
          </p>
        </div>
      </div>
    </li>
  );
}
