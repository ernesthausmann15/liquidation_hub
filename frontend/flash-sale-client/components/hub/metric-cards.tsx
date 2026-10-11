import { Boxes, Gauge, Landmark, Package, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";

import { count, LIQUIDATION_STATUSES, usd, usdCompact, type InventorySummary } from "@/lib/hub-api";
import { cn } from "@/lib/utils";
import { statusMeta } from "./ui";

/** Status bar colours follow the badge tones in ui.tsx. */
const barColor: Record<(typeof LIQUIDATION_STATUSES)[number], string> = {
  staged: "bg-info",
  listed: "bg-brand",
  reserved: "bg-signal",
  liquidated: "bg-success",
  written_off: "bg-danger",
};

function Metric({
  label,
  value,
  detail,
  icon,
  accent,
}: {
  label: string;
  value: string;
  detail: ReactNode;
  icon: ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="glass-raised rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-muted">{label}</p>
        <span className={cn("text-ink-subtle", accent && "text-brand")}>{icon}</span>
      </div>
      <p
        className={cn(
          "mt-3 font-display text-3xl font-bold tabular-nums tracking-tight",
          accent ? "text-brand" : "text-ink",
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-ink-muted">{detail}</p>
    </div>
  );
}

/** Layer 2: valuation widgets. Figures come from GET /api/inventory/summary. */
export function MetricCards({ summary }: { summary: InventorySummary | null }) {
  if (!summary) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="glass-raised h-[132px] animate-pulse rounded-2xl" />
        ))}
      </div>
    );
  }

  const rate =
    summary.open_book_value > 0 ? summary.open_costed_recovery_value / summary.open_book_value : null;
  const totalValue = summary.by_status.reduce((acc, b) => acc + b.recovery_value, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          accent
          label="Open recovery value"
          value={usdCompact.format(summary.open_recovery_value)}
          detail={`${usd.format(summary.open_recovery_value)} across staged, listed and reserved`}
          icon={<Landmark className="size-4" aria-hidden />}
        />
        <Metric
          label="Book value at cost"
          value={usdCompact.format(summary.open_book_value)}
          detail="Acquisition cost of open units with a cost basis"
          icon={<Boxes className="size-4" aria-hidden />}
        />
        <Metric
          label="Expected recovery rate"
          value={rate === null ? "—" : `${(rate * 100).toFixed(1)}%`}
          detail={rate === null ? "Add cost basis to items to compute" : "List value ÷ cost, costed items only"}
          icon={<Gauge className="size-4" aria-hidden />}
        />
        <Metric
          label="Open units"
          value={count.format(summary.open_units)}
          detail={
            summary.low_stock_items > 0 ? (
              <span className="inline-flex items-center gap-1 text-signal">
                <TriangleAlert className="size-3.5" aria-hidden />
                {summary.low_stock_items} item{summary.low_stock_items === 1 ? "" : "s"} at 5 units or fewer
              </span>
            ) : (
              `${count.format(summary.total_items)} SKUs tracked`
            )
          }
          icon={<Package className="size-4" aria-hidden />}
        />
      </div>

      <div className="glass-raised rounded-2xl p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-sm font-semibold text-ink">Portfolio by liquidation stage</h2>
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-subtle">List value · all stages</p>
        </div>
        <div className="mt-4 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-data" role="img"
          aria-label={summary.by_status
            .map((b) => `${statusMeta[b.status].label} ${usd.format(b.recovery_value)}`)
            .join(", ")}
        >
          {totalValue > 0 &&
            summary.by_status
              .filter((b) => b.recovery_value > 0)
              .map((b) => (
                <span
                  key={b.status}
                  className={cn("h-full", barColor[b.status])}
                  style={{ width: `${(b.recovery_value / totalValue) * 100}%` }}
                />
              ))}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
          {summary.by_status.map((b) => (
            <div key={b.status}>
              <dt className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-ink-muted">
                <span className={cn("size-2 rounded-full", barColor[b.status])} aria-hidden />
                {statusMeta[b.status].label}
              </dt>
              <dd className="mt-1 font-mono text-sm tabular-nums text-ink">
                {usdCompact.format(b.recovery_value)}
                <span className="ml-2 text-ink-subtle">{count.format(b.units)} u</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
