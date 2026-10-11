"use client";

import { useState, type FormEvent } from "react";

import {
  ApiError,
  hubApi,
  LIQUIDATION_STATUSES,
  type InventoryInput,
  type InventoryItem,
  type LiquidationStatus,
} from "@/lib/hub-api";
import { GlassDialog } from "./glass-dialog";
import { Alert, Button, Field, Input, Select, statusMeta, Textarea } from "./ui";

type Draft = Record<"name" | "sku" | "description" | "category" | "base_price" | "cost_basis" | "stock", string> & {
  liquidation_status: LiquidationStatus;
};

function toDraft(item: InventoryItem | null): Draft {
  return {
    name: item?.name ?? "",
    sku: item?.sku ?? "",
    description: item?.description ?? "",
    category: item?.category ?? "",
    liquidation_status: item?.liquidation_status ?? "staged",
    base_price: item ? String(item.base_price) : "",
    cost_basis: item?.cost_basis != null ? String(item.cost_basis) : "",
    stock: item ? String(item.stock) : "",
  };
}

function toInput(d: Draft): InventoryInput {
  return {
    name: d.name.trim(),
    sku: d.sku.trim() || null,
    description: d.description.trim() || null,
    category: d.category.trim() || "Uncategorized",
    liquidation_status: d.liquidation_status,
    base_price: Number(d.base_price),
    cost_basis: d.cost_basis.trim() === "" ? null : Number(d.cost_basis),
    stock: Number(d.stock),
  };
}

/**
 * Create / edit form. Edits carry the row version; a 409 means another operator saved first,
 * so the form reloads their row and asks the user to re-apply instead of silently overwriting.
 */
export function ItemDialog({
  item,
  open,
  categories,
  onClose,
  onSaved,
  onConflict,
}: {
  /** null = create */
  item: InventoryItem | null;
  open: boolean;
  categories: string[];
  onClose: () => void;
  onSaved: (item: InventoryItem) => void;
  /** The row as the database has it now, after another operator's save won. */
  onConflict: (item: InventoryItem) => void;
}) {
  // The parent remounts this component (key) per item, so initial state is enough.
  const [current, setCurrent] = useState(item);
  const [draft, setDraft] = useState(() => toDraft(item));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ tone: "error" | "warning"; message: string } | null>(null);

  const set = (key: keyof Draft) => (e: { target: { value: string } }) =>
    setDraft((d) => ({ ...d, [key]: e.target.value }));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const input = toInput(draft);
      const { item: saved } = current
        ? await hubApi.update(current.product_id, current.version, input)
        : await hubApi.create(input);
      onSaved(saved);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.item) {
        setCurrent(err.item);
        setDraft(toDraft(err.item));
        onConflict(err.item);
        setError({
          tone: "warning",
          message: "Another operator saved this item first. Their version is loaded; re-apply your changes.",
        });
      } else {
        setError({ tone: "error", message: err instanceof Error ? err.message : "Save failed." });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <GlassDialog
      open={open}
      onClose={onClose}
      title={current ? "Edit item" : "Stage new item"}
      description={current ? `Version ${current.version} · #${current.product_id}` : "Adds a row to the products table."}
      className="max-w-2xl"
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <Alert tone={error.tone}>{error.message}</Alert>}

        <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
          <Field label="Item name" htmlFor="item-name">
            <Input id="item-name" required maxLength={255} value={draft.name} onChange={set("name")} />
          </Field>
          <Field label="SKU" htmlFor="item-sku" hint="Unique, optional">
            <Input id="item-sku" maxLength={64} value={draft.sku} onChange={set("sku")} className="font-mono" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="item-category">
            <Input
              id="item-category"
              list="item-categories"
              maxLength={80}
              placeholder="Uncategorized"
              value={draft.category}
              onChange={set("category")}
            />
            <datalist id="item-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Liquidation status" htmlFor="item-status">
            <Select id="item-status" value={draft.liquidation_status} onChange={set("liquidation_status")}>
              {LIQUIDATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusMeta[s].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Units" htmlFor="item-stock">
            <Input id="item-stock" type="number" required min={0} step={1} inputMode="numeric"
              value={draft.stock} onChange={set("stock")} className="font-mono" />
          </Field>
          <Field label="List price / unit" htmlFor="item-price">
            <Input id="item-price" type="number" required min={0} step="0.01" inputMode="decimal"
              value={draft.base_price} onChange={set("base_price")} className="font-mono" />
          </Field>
          <Field label="Cost basis / unit" htmlFor="item-cost" hint="Drives recovery rate">
            <Input id="item-cost" type="number" min={0} step="0.01" inputMode="decimal"
              value={draft.cost_basis} onChange={set("cost_basis")} className="font-mono" />
          </Field>
        </div>

        <Field label="Notes" htmlFor="item-description">
          <Textarea id="item-description" maxLength={5000} value={draft.description} onChange={set("description")} />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={pending}>
            {current ? "Save changes" : "Stage item"}
          </Button>
        </div>
      </form>
    </GlassDialog>
  );
}
