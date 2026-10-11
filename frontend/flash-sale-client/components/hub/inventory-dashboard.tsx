"use client";

import { Plus, RefreshCw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ApiError,
  hubApi,
  LIQUIDATION_STATUSES,
  usd,
  type HubUser,
  type InventoryItem,
  type InventorySummary,
  type LiquidationStatus,
} from "@/lib/hub-api";
import { cn } from "@/lib/utils";
import { GlassDialog } from "./glass-dialog";
import { InventoryGrid } from "./inventory-grid";
import { ItemDialog } from "./item-dialog";
import { MetricCards } from "./metric-cards";
import { TopNav } from "./top-nav";
import { Alert, Button, Input, Select, statusMeta } from "./ui";

/** Valuation and grid refresh while the tab is visible. Edits are version-checked, so polling is safe. */
const POLL_MS = 20_000;

type DialogState = { kind: "create" } | { kind: "edit"; item: InventoryItem } | null;

export function InventoryDashboard() {
  const router = useRouter();
  const [user, setUser] = useState<HubUser | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<LiquidationStatus | "">("");

  const [dialog, setDialog] = useState<DialogState>(null);
  const [dialogKey, setDialogKey] = useState(0);
  const [deleting, setDeleting] = useState<InventoryItem | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Responses for an older filter set must not overwrite a newer one.
  const requestId = useRef(0);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login?next=/inventory");
        return;
      }
      setError(err instanceof Error ? err.message : "Something went wrong.");
    },
    [router],
  );

  const refreshSummary = useCallback(() => {
    hubApi.summary().then(({ summary }) => setSummary(summary), handleError);
  }, [handleError]);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const [list, stats] = await Promise.all([
        hubApi.list({ q: debouncedQuery, category, status: status || undefined }),
        hubApi.summary(),
      ]);
      if (id !== requestId.current) return;
      setItems(list.items);
      setCategories(list.categories);
      setSummary(stats.summary);
      setError(null);
    } catch (err) {
      if (id === requestId.current) handleError(err);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [debouncedQuery, category, status, handleError]);

  useEffect(() => {
    hubApi.me().then(({ user }) => setUser(user), handleError);
  }, [handleError]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  function upsert(saved: InventoryItem) {
    setItems((list) => {
      const i = list.findIndex((x) => x.product_id === saved.product_id);
      if (i === -1) return [saved, ...list];
      const next = list.slice();
      next[i] = saved;
      return next;
    });
    if (!categories.includes(saved.category)) setCategories((c) => [...c, saved.category].sort());
    refreshSummary();
  }

  function openDialog(state: DialogState) {
    setDialogKey((k) => k + 1);
    setDialog(state);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      await hubApi.remove(deleting.product_id, deleting.version);
      setItems((list) => list.filter((x) => x.product_id !== deleting.product_id));
      setDeleting(null);
      refreshSummary();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.item) {
        upsert(err.item);
        setDeleting(err.item);
      }
      if (err instanceof ApiError && err.status === 401) handleError(err);
      else setDeleteError(err instanceof Error ? err.message : "Delete failed.");
    } finally {
      setDeletePending(false);
    }
  }

  async function signOut() {
    await hubApi.logout().catch(() => {});
    router.replace("/login");
    router.refresh();
  }

  const countFor = (s: LiquidationStatus) => summary?.by_status.find((b) => b.status === s)?.items ?? 0;

  return (
    <div className="ambient-canvas min-h-dvh pb-16">
      <TopNav user={user} onSignOut={signOut} />

      <main id="main" className="mx-auto max-w-[1440px] space-y-6 px-4 pt-8 sm:px-6 lg:px-9">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-brand">PostgreSQL · products</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-ink sm:text-4xl">Portfolio inventory</h1>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void load()} aria-label="Refresh" disabled={loading}>
              <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden />
            </Button>
            <Button onClick={() => openDialog({ kind: "create" })}>
              <Plus className="size-4" aria-hidden />
              Stage item
            </Button>
          </div>
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        <MetricCards summary={summary} />

        <section aria-label="Inventory grid" className="space-y-3">
          <div className="glass-raised flex flex-wrap items-center gap-3 rounded-2xl p-3">
            <div role="radiogroup" aria-label="Liquidation status" className="flex flex-wrap gap-1">
              {(["", ...LIQUIDATION_STATUSES] as const).map((s) => {
                const active = status === s;
                return (
                  <button
                    key={s || "all"}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setStatus(s)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider transition-colors",
                      active ? "bg-brand text-on-brand" : "text-ink-muted hover:bg-white/5 hover:text-ink",
                    )}
                  >
                    {s ? statusMeta[s].label : "All"}
                    {s && <span className={cn("ml-1.5 tabular-nums", active ? "opacity-70" : "text-ink-subtle")}>{countFor(s)}</span>}
                  </button>
                );
              })}
            </div>

            <div className="ml-auto flex w-full flex-wrap gap-2 sm:w-auto">
              <Select
                glass
                aria-label="Category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full sm:w-48"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
                <Input
                  glass
                  type="search"
                  aria-label="Search name or SKU"
                  placeholder="Search name or SKU"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="h-10 pl-9"
                />
              </div>
            </div>
          </div>

          <InventoryGrid
            items={items}
            loading={loading && items.length === 0}
            onEdit={(item) => openDialog({ kind: "edit", item })}
            onDelete={(item) => {
              setDeleteError(null);
              setDeleting(item);
            }}
          />
          <p className="font-mono text-[11px] text-ink-subtle" aria-live="polite">
            {items.length} row{items.length === 1 ? "" : "s"} · refreshes every {POLL_MS / 1000}s
          </p>
        </section>
      </main>

      {dialog && (
        <ItemDialog
          key={dialogKey}
          open
          item={dialog.kind === "edit" ? dialog.item : null}
          categories={categories}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            upsert(saved);
            setDialog(null);
          }}
          onConflict={upsert}
        />
      )}

      <GlassDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Delete item?"
        description="Removes the row from PostgreSQL. Liquidated stock should normally be marked written off instead."
        className="max-w-md"
      >
        {deleting && (
          <div className="space-y-5">
            {deleteError && <Alert tone="error">{deleteError}</Alert>}
            <div className="surface-data rounded-xl p-4 text-sm">
              <p className="font-medium text-ink">{deleting.name}</p>
              <p className="mt-1 font-mono text-xs text-ink-muted">
                {deleting.sku ?? `#${deleting.product_id}`} · {deleting.stock} units · {usd.format(deleting.stock * deleting.base_price)}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button variant="danger" loading={deletePending} onClick={() => void confirmDelete()}>
                Delete
              </Button>
            </div>
          </div>
        )}
      </GlassDialog>
    </div>
  );
}
