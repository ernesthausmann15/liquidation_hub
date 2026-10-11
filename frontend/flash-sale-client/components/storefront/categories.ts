import { Boxes, Laptop, Shirt, Sofa, type LucideIcon } from "lucide-react";

/** Storefront categories. Names must match VIP_CATEGORIES in backend/server.js. */
export const CATEGORIES = [
  {
    name: "Electronics",
    icon: Laptop,
    blurb: "Open-box laptops, monitors and networking gear, graded and tested.",
  },
  {
    name: "Home Goods",
    icon: Sofa,
    blurb: "Furniture, kitchenware and décor from store closures and overstock.",
  },
  {
    name: "Bulk Pallets",
    icon: Boxes,
    blurb: "Mixed and single-SKU pallets for resellers, sold by the lot.",
  },
  {
    name: "Apparel",
    icon: Shirt,
    blurb: "Shelf-pull and end-of-season clothing, footwear and accessories.",
  },
] as const satisfies readonly { name: string; icon: LucideIcon; blurb: string }[];

export type CategoryName = (typeof CATEGORIES)[number]["name"];
