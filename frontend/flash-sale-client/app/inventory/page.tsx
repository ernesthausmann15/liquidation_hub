import type { Metadata } from "next";

import { InventoryDashboard } from "@/components/hub/inventory-dashboard";

// Operator pages stay out of search results; only the storefront is public.
export const metadata: Metadata = { title: "Inventory", robots: { index: false, follow: false } };

export default function InventoryPage() {
  return <InventoryDashboard />;
}
