/**
 * Typed client for the Liquidation Hub endpoints in backend/auth.js and backend/inventory.js.
 * Requests are same-origin (/api is rewritten to Express in next.config.ts), so the
 * HttpOnly session cookie rides along without any token handling in JavaScript.
 */

export const LIQUIDATION_STATUSES = [
  "staged",
  "listed",
  "reserved",
  "liquidated",
  "written_off",
] as const;
export type LiquidationStatus = (typeof LIQUIDATION_STATUSES)[number];

/** One row of the products table, as returned by backend/inventory.js (COLUMNS). */
export type InventoryItem = {
  product_id: number;
  sku: string | null;
  name: string;
  description: string | null;
  category: string;
  liquidation_status: LiquidationStatus;
  base_price: number;
  cost_basis: number | null;
  stock: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  version: number;
};

export type InventoryInput = Pick<
  InventoryItem,
  "name" | "sku" | "description" | "category" | "liquidation_status" | "base_price" | "cost_basis" | "stock"
>;

export type StatusBucket = {
  status: LiquidationStatus;
  items: number;
  units: number;
  recovery_value: number;
  book_value: number;
  costed_recovery_value: number;
  low_stock: number;
};

export type InventorySummary = {
  open_recovery_value: number;
  open_book_value: number;
  open_costed_recovery_value: number;
  open_units: number;
  total_items: number;
  low_stock_items: number;
  by_status: StatusBucket[];
};

export type HubUser = {
  user_id: number;
  email: string;
  display_name: string | null;
  /** viewer is read-only; the API answers 403 to its writes. */
  role: "viewer" | "operator" | "admin";
  is_demo: boolean;
};

export type DemoKind = "manager" | "consumer";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** On a 409 the server sends the row as it is now, so the grid can reconcile. */
    readonly item?: InventoryItem,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      cache: "no-store",
      credentials: "same-origin",
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      signal: init?.signal ?? AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ApiError("The hub API is unreachable. Check that the backend is running.", 0);
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    throw new ApiError(body.error ?? `Request failed (${response.status})`, response.status, body.item);
  }
  return body as T;
}

export const hubApi = {
  login: (email: string, password: string) =>
    request<{ user: HubUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => request<unknown>("/api/auth/logout", { method: "POST" }),
  me: () => request<{ user: HubUser }>("/api/auth/me"),
  /** Starts a demo session; the server records the click in demo_clicks. */
  demo: (kind: DemoKind) =>
    request<{ user: HubUser }>("/api/auth/demo", { method: "POST", body: JSON.stringify({ kind }) }),

  list: (filters: { q?: string; category?: string; status?: LiquidationStatus }) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
    return request<{ items: InventoryItem[]; categories: string[] }>(`/api/inventory?${params}`);
  },
  summary: () => request<{ summary: InventorySummary }>("/api/inventory/summary"),
  create: (input: InventoryInput) =>
    request<{ item: InventoryItem }>("/api/inventory", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  update: (id: number, version: number, patch: Partial<InventoryInput>) =>
    request<{ item: InventoryItem }>(`/api/inventory/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...patch, version }),
    }),
  remove: (id: number, version: number) =>
    request<unknown>(`/api/inventory/${id}?version=${version}`, { method: "DELETE" }),
};

export const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
export const usdCompact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});
export const count = new Intl.NumberFormat("en-US");
