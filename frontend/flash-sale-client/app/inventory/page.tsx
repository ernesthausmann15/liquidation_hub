import type { Metadata } from "next";

import { InventoryDashboard } from "@/components/hub/inventory-dashboard";

export const metadata: Metadata = { title: "Inventory" };

export default function InventoryPage() {
  return <InventoryDashboard />;
}
