"use client";

import { X } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";

import { SEED_INVENTORY } from "@/lib/live-stream/inventory-data";
import { onOrder, type ActivityEvent } from "@/lib/live-stream/simulator";

const VISIBLE_TOASTS = 3;
const TOAST_MS = 6_000;
const imageFor = new Map(SEED_INVENTORY.map((item) => [item.id, item.imageUrl]));

/** Bottom-corner purchase toasts, one per new simulated order. Never steals focus. */
export function ActivityToasts() {
  const [toasts, setToasts] = useState<ActivityEvent[]>([]);

  useEffect(() => {
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const stop = onOrder((event) => {
      setToasts((current) => [event, ...current].slice(0, VISIBLE_TOASTS));
      const timer = setTimeout(() => {
        timers.delete(timer);
        setToasts((current) => current.filter((t) => t.id !== event.id));
      }, TOAST_MS);
      timers.add(timer);
    });
    return () => {
      stop();
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);

  const dismiss = (id: string) => setToasts((current) => current.filter((t) => t.id !== id));

  return (
    <div
      aria-live="polite"
      aria-label="Recent simulated purchases"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-50 flex flex-col-reverse gap-2 sm:inset-x-auto sm:left-6 sm:bottom-6 sm:w-80"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="glass-overlay pointer-events-auto flex items-center gap-3 rounded-xl p-3 motion-safe:animate-toast-in"
        >
          <Image
            src={imageFor.get(toast.itemId) ?? "/products/package.svg"}
            alt=""
            width={48}
            height={36}
            unoptimized
            className="h-9 w-12 shrink-0 rounded-md object-cover"
          />
          <div className="min-w-0 flex-1 text-xs leading-snug">
            <p className="text-ink-muted">
              Buyer in <span className="font-semibold text-ink">{toast.city}</span>
            </p>
            <p className="truncate text-ink">
              purchased {toast.quantity}× {toast.title}
            </p>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-subtle">
              <span className="text-brand">{toast.discountPercentage}% off</span> · simulated order
            </p>
          </div>
          <button
            type="button"
            onClick={() => dismiss(toast.id)}
            className="shrink-0 rounded-md p-1 text-ink-subtle hover:bg-white/5 hover:text-ink"
            aria-label="Dismiss"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
