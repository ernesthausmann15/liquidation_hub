/**
 * Simulated live marketplace for demo mode: fake orders arrive every 4-12 s, stock drains, items
 * sell out, and per-item viewer counts drift. Everything runs in this tab. State is mirrored to
 * sessionStorage (so a reload keeps the story going) and is reset to the seed after 60 minutes,
 * when everything has sold out, or on demand. Nothing here touches the API or Postgres.
 *
 * Framework-free store (subscribe / getSnapshot) so React reads it with useSyncExternalStore.
 */
import { SEED_INVENTORY, stockStatus, type LiquidationItem } from "./inventory-data";

export type ActivityEvent = {
  id: string;
  itemId: string;
  title: string;
  quantity: number;
  city: string;
  discountPercentage: number;
  soldOut: boolean;
  at: number;
};

export type SimulatorState = {
  items: readonly LiquidationItem[];
  /** Newest first, capped at MAX_EVENTS. */
  events: readonly ActivityEvent[];
  viewers: Readonly<Record<string, number>>;
  unitsClaimed: number;
  startedAt: number;
};

export const START_KEY = "simulation_start_time";
const STATE_KEY = "liquidation_hub_simulation";
const RESET_AFTER_MS = 60 * 60 * 1000;
const MIN_ORDER_DELAY_MS = 4_000;
const MAX_ORDER_DELAY_MS = 12_000;
const VIEWER_DRIFT_MS = 5_000;
const MAX_EVENTS = 25;

const CITIES = [
  "Chicago, IL", "Houston, TX", "Phoenix, AZ", "Philadelphia, PA", "San Antonio, TX", "San Diego, CA",
  "Dallas, TX", "Austin, TX", "Jacksonville, FL", "Columbus, OH", "Charlotte, NC", "Indianapolis, IN",
  "Seattle, WA", "Denver, CO", "Nashville, TN", "Oklahoma City, OK", "Portland, OR", "Las Vegas, NV",
  "Detroit, MI", "Memphis, TN", "Louisville, KY", "Milwaukee, WI", "Albuquerque, NM", "Tucson, AZ",
  "Atlanta, GA", "Kansas City, MO", "Omaha, NE", "Raleigh, NC", "Miami, FL", "Minneapolis, MN",
  "Tampa, FL", "New Orleans, LA", "Cleveland, OH", "Pittsburgh, PA", "Salt Lake City, UT", "Boise, ID",
];

const randomInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));
const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];

function initialViewers(items: readonly LiquidationItem[]) {
  return Object.fromEntries(items.map((item) => [item.id, item.currentStock > 0 ? randomInt(3, 40) : 0]));
}

function seedState(startedAt: number): SimulatorState {
  return { items: SEED_INVENTORY, events: [], viewers: initialViewers(SEED_INVENTORY), unitsClaimed: 0, startedAt };
}

/** Rendered on the server and during hydration: seed stock, no viewers, so markup is deterministic. */
const SERVER_STATE: SimulatorState = { items: SEED_INVENTORY, events: [], viewers: {}, unitsClaimed: 0, startedAt: 0 };

let state = SERVER_STATE;
const listeners = new Set<() => void>();
const orderListeners = new Set<(event: ActivityEvent) => void>();

function setState(next: SimulatorState) {
  state = next;
  persist();
  for (const listener of listeners) listener();
}

// ------------------------------------------------------------------ sessionStorage

type Persisted = { stock: Record<string, number>; events: ActivityEvent[]; unitsClaimed: number };

function storage() {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null; // storage disabled (privacy mode, sandboxed iframe): run in memory only
  }
}

function persist() {
  const store = storage();
  if (!store || state === SERVER_STATE) return;
  const data: Persisted = {
    stock: Object.fromEntries(state.items.map((item) => [item.id, item.currentStock])),
    events: [...state.events],
    unitsClaimed: state.unitsClaimed,
  };
  try {
    store.setItem(START_KEY, String(state.startedAt));
    store.setItem(STATE_KEY, JSON.stringify(data));
  } catch {
    // Quota or serialization failure: the in-memory state is still correct.
  }
}

/** Restores this tab's simulation, or starts fresh when there is none, it is corrupt or expired. */
function load(now: number): SimulatorState {
  const store = storage();
  const startedAt = Number(store?.getItem(START_KEY));
  if (!store || !Number.isFinite(startedAt) || startedAt <= 0 || now - startedAt >= RESET_AFTER_MS) {
    return seedState(now);
  }
  try {
    const data = JSON.parse(store.getItem(STATE_KEY) ?? "null") as Partial<Persisted> | null;
    if (!data?.stock || !Array.isArray(data.events)) return seedState(now);
    const items = SEED_INVENTORY.map((item) => {
      const saved = data.stock?.[item.id];
      const currentStock =
        Number.isInteger(saved) && saved! >= 0 && saved! <= item.initialStock ? saved! : item.initialStock;
      return { ...item, currentStock, status: stockStatus(currentStock) };
    });
    return {
      items,
      events: data.events.slice(0, MAX_EVENTS),
      viewers: initialViewers(items),
      unitsClaimed: Number(data.unitsClaimed) || 0,
      startedAt,
    };
  } catch {
    return seedState(now);
  }
}

// ------------------------------------------------------------------ simulation

function placeOrder() {
  const available = state.items.filter((item) => item.currentStock > 0);
  if (available.length === 0) return resetSimulatorState();

  const item = pick(available);
  // Whole pallets and truckloads go one at a time; small items in ones to threes.
  const maxQuantity = item.category === "Pallet Lots" ? 1 : Math.min(3, item.currentStock);
  const quantity = randomInt(1, maxQuantity);
  const currentStock = item.currentStock - quantity;

  const event: ActivityEvent = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    itemId: item.id,
    title: item.title,
    quantity,
    city: pick(CITIES),
    discountPercentage: item.discountPercentage,
    soldOut: currentStock === 0,
    at: Date.now(),
  };

  setState({
    ...state,
    items: state.items.map((i) => (i.id === item.id ? { ...i, currentStock, status: stockStatus(currentStock) } : i)),
    events: [event, ...state.events].slice(0, MAX_EVENTS),
    // A sale draws a small crowd; a sold-out card empties.
    viewers: { ...state.viewers, [item.id]: currentStock === 0 ? 0 : (state.viewers[item.id] ?? 0) + randomInt(1, 4) },
    unitsClaimed: state.unitsClaimed + quantity,
  });
  for (const listener of orderListeners) listener(event);
}

function driftViewers() {
  const viewers: Record<string, number> = {};
  for (const item of state.items) {
    viewers[item.id] =
      item.currentStock > 0 ? Math.min(60, Math.max(1, (state.viewers[item.id] ?? 5) + randomInt(-3, 3))) : 0;
  }
  // Viewer counts are not persisted, so skip the sessionStorage write.
  state = { ...state, viewers };
  for (const listener of listeners) listener();
}

/** Restores the seed inventory, clears the activity log and restarts the 60-minute window. */
export function resetSimulatorState() {
  setState(seedState(Date.now()));
}

let running = 0;
let orderTimer: ReturnType<typeof setTimeout> | undefined;
let viewerTimer: ReturnType<typeof setInterval> | undefined;

function scheduleOrder() {
  orderTimer = setTimeout(() => {
    if (Date.now() - state.startedAt >= RESET_AFTER_MS) resetSimulatorState();
    // A hidden tab would otherwise queue up a burst of toasts for when the visitor returns.
    else if (!document.hidden) placeOrder();
    scheduleOrder();
  }, randomInt(MIN_ORDER_DELAY_MS, MAX_ORDER_DELAY_MS));
}

declare global {
  interface Window {
    resetSimulatorState?: typeof resetSimulatorState;
  }
}

/** Starts the loop. Reference-counted, so every widget can call it; returns that widget's stop. */
export function startSimulator() {
  if (running++ === 0) {
    setState(load(Date.now()));
    scheduleOrder();
    viewerTimer = setInterval(() => {
      if (!document.hidden) driftViewers();
    }, VIEWER_DRIFT_MS);
    if (process.env.NODE_ENV !== "production") window.resetSimulatorState = resetSimulatorState;
  }
  return () => {
    if (--running > 0) return;
    clearTimeout(orderTimer);
    clearInterval(viewerTimer);
    if (window.resetSimulatorState === resetSimulatorState) delete window.resetSimulatorState;
  };
}

export const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
export const getSnapshot = () => state;
export const getServerSnapshot = () => SERVER_STATE;

/** Fires once per new simulated order (not for events restored from storage). */
export function onOrder(listener: (event: ActivityEvent) => void) {
  orderListeners.add(listener);
  return () => void orderListeners.delete(listener);
}
