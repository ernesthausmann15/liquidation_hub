import { PackageOpen, Pencil, Trash2 } from "lucide-react";

import { count, usd, type InventoryItem } from "@/lib/hub-api";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./ui";

const LOW_STOCK = 5;
const updatedFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Layer 1: the data grid is solid (no translucency) so figures stay razor-sharp.
 * Rows alternate #111415 / #1a1d24 with hairline rules, per the Stitch wholesale-grid spec.
 */
export function InventoryGrid({
  items,
  loading,
  onEdit,
  onDelete,
}: {
  items: InventoryItem[];
  loading: boolean;
  onEdit: (item: InventoryItem) => void;
  onDelete: (item: InventoryItem) => void;
}) {
  return (
    <div className="surface-data overflow-hidden rounded-2xl">
      <div className="max-h-[calc(100dvh-14rem)] overflow-auto">
        <table className="w-full min-w-[1080px] border-collapse text-sm">
          <caption className="sr-only">Inventory items</caption>
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-line text-left font-mono text-[11px] uppercase tracking-[0.1em] text-ink-muted">
              <th scope="col" className="px-4 py-3 font-medium">SKU</th>
              <th scope="col" className="px-4 py-3 font-medium">Item</th>
              <th scope="col" className="px-4 py-3 font-medium">Category</th>
              <th scope="col" className="px-4 py-3 font-medium">Status</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Units</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">List / unit</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Cost / unit</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Recovery value</th>
              <th scope="col" className="px-4 py-3 font-medium">Updated</th>
              <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className={cn("transition-opacity", loading && "opacity-60")}>
            {items.map((item) => {
              const low = item.stock > 0 && item.stock <= LOW_STOCK;
              const closed = item.liquidation_status === "liquidated" || item.liquidation_status === "written_off";
              return (
                <tr
                  key={item.product_id}
                  className="border-b border-line/70 odd:bg-data even:bg-surface hover:bg-sunken focus-within:bg-sunken"
                >
                  <td className="px-4 py-3 font-mono text-xs text-ink-muted">
                    {item.sku ?? <span className="text-ink-subtle">#{item.product_id}</span>}
                  </td>
                  <td className="max-w-[22rem] px-4 py-3">
                    <p className="truncate font-medium text-ink">{item.name}</p>
                    {item.description && <p className="truncate text-xs text-ink-subtle">{item.description}</p>}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{item.category}</td>
                  <td className="px-4 py-3"><StatusBadge status={item.liquidation_status} /></td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right font-mono tabular-nums",
                      item.stock === 0 ? "text-ink-subtle" : low ? "text-signal" : "text-ink",
                    )}
                  >
                    {count.format(item.stock)}
                    {low && <span className="sr-only"> (low stock)</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-ink">{usd.format(item.base_price)}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums text-ink-muted">
                    {item.cost_basis === null ? "—" : usd.format(item.cost_basis)}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 text-right font-mono tabular-nums",
                      closed ? "text-ink-subtle line-through decoration-ink-subtle/50" : "text-brand",
                    )}
                  >
                    {usd.format(item.stock * item.base_price)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink-subtle">
                    <time dateTime={item.updated_at}>{updatedFmt.format(new Date(item.updated_at))}</time>
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onEdit(item)}
                        aria-label={`Edit ${item.name}`}
                        className="grid size-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-white/5 hover:text-brand"
                      >
                        <Pencil className="size-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(item)}
                        aria-label={`Delete ${item.name}`}
                        className="grid size-8 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-danger-tint hover:text-danger"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
            <PackageOpen className="size-8 text-ink-subtle" aria-hidden />
            <p className="font-display font-semibold text-ink">No items match</p>
            <p className="text-sm text-ink-muted">Clear the filters or stage a new item.</p>
          </div>
        )}
      </div>
    </div>
  );
}
