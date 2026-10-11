"use client";

import { RotateCcw } from "lucide-react";

import { Badge } from "@/components/hub/ui";
import { resetSimulatorState } from "@/lib/live-stream/simulator";
import { useLiveMarketplace } from "@/lib/live-stream/use-live-marketplace";

/** "Live Marketplace Stream" bar under the top nav: the latest simulated order slides in. */
export function LiveTicker() {
  const { events, unitsClaimed } = useLiveMarketplace();
  const latest = events[0];

  return (
    <div className="glass-raised mx-auto mt-2 flex h-10 max-w-6xl items-center gap-3 rounded-xl px-3 text-xs sm:px-4">
      <span className="relative flex size-2 shrink-0" aria-hidden>
        <span className="absolute inline-flex size-full rounded-full bg-signal opacity-75 motion-safe:animate-ping" />
        <span className="relative inline-flex size-2 rounded-full bg-signal" />
      </span>
      <span className="hidden shrink-0 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-signal sm:inline">
        Live marketplace stream
      </span>
      <Badge title="Orders, stock and viewer counts in this stream are simulated for the demo.">Simulated</Badge>

      <div className="min-w-0 flex-1 overflow-hidden">
        {latest ? (
          <p key={latest.id} className="truncate text-ink-muted motion-safe:animate-ticker-in">
            Buyer in <span className="text-ink">{latest.city}</span> purchased{" "}
            <span className="text-ink">
              {latest.quantity}× {latest.title}
            </span>{" "}
            <span className="font-mono font-semibold text-brand">{latest.discountPercentage}% OFF</span>
            {latest.soldOut && <span className="font-mono font-semibold text-danger"> · now sold out</span>}
          </p>
        ) : (
          <p className="truncate text-ink-subtle">Waiting for the next deal to be claimed…</p>
        )}
      </div>

      <span className="hidden shrink-0 font-mono text-[11px] uppercase tracking-wider text-ink-subtle md:inline">
        {unitsClaimed} units claimed
      </span>
      <button
        type="button"
        onClick={resetSimulatorState}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-wider text-ink-muted hover:bg-white/5 hover:text-brand"
        title="Restore every item's stock and clear the activity log"
      >
        <RotateCcw className="size-3.5" aria-hidden />
        <span className="hidden lg:inline">Reset demo data</span>
        <span className="sr-only lg:hidden">Reset demo data</span>
      </button>
    </div>
  );
}
