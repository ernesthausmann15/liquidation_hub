"use client";

import { ArrowUpRight, Eye, Loader2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ApiError, hubApi, type DemoKind } from "@/lib/hub-api";
import { cn } from "@/lib/utils";
import { Alert } from "./ui";

const OPTIONS: { kind: DemoKind; title: string; detail: string; Icon: typeof ShieldCheck }[] = [
  {
    kind: "manager",
    title: "Demo Manager",
    detail: "Full access: stage, edit and delete inventory",
    Icon: ShieldCheck,
  },
  {
    kind: "consumer",
    title: "Demo Viewer",
    detail: "Read-only: browse valuation and the data grid",
    Icon: Eye,
  },
];

/**
 * One-click portfolio demo. No credentials live in the browser: the API creates a short-lived
 * session for a dedicated demo account and logs the click for engagement analytics.
 */
export function DemoButtons({ next }: { next: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<DemoKind | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(kind: DemoKind) {
    if (pending) return;
    setPending(kind);
    setError(null);
    try {
      await hubApi.demo(kind);
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The demo could not start. Try again.");
      setPending(null);
    }
  }

  return (
    <div className="mt-8">
      <div className="flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-white/15" />
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-ink-subtle">or explore the demo</span>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-white/15" />
      </div>

      {error && (
        <div className="mt-4">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {OPTIONS.map(({ kind, title, detail, Icon }) => {
          const busy = pending === kind;
          return (
            <button
              key={kind}
              type="button"
              onClick={() => void start(kind)}
              disabled={pending !== null}
              aria-busy={busy || undefined}
              className={cn(
                "glass-raised group rounded-2xl p-4 text-left transition-[transform,box-shadow] duration-200",
                "hover:-translate-y-0.5 hover:shadow-[0_0_0_1px_rgb(255_186_32/0.55),0_12px_32px_-12px_rgb(255_186_32/0.45)]",
                "disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-none",
              )}
            >
              <span className="flex items-center justify-between">
                <span
                  className={cn(
                    "grid size-9 place-items-center rounded-xl border",
                    kind === "manager"
                      ? "border-brand/40 bg-brand-tint text-brand"
                      : "border-signal/40 bg-signal-tint text-signal",
                  )}
                >
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Icon className="size-4" aria-hidden />}
                </span>
                <ArrowUpRight
                  className="size-4 text-ink-subtle transition-colors group-hover:text-brand"
                  aria-hidden
                />
              </span>
              <span className="mt-3 block font-display text-[15px] font-semibold text-ink">{title}</span>
              <span className="mt-0.5 block text-xs leading-snug text-ink-muted">{detail}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-center text-[11px] text-ink-subtle">
        Demo sessions last 2 hours. Visits are counted anonymously.
      </p>
    </div>
  );
}
