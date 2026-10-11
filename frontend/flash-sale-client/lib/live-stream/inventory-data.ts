/**
 * Seed inventory for the simulated live marketplace (demo mode only). Lives in memory and in
 * sessionStorage; never written to Postgres. The liquidation price is the target discount rounded
 * up to .99, and the shown discount is recomputed from it, so the three numbers always agree and
 * never exceed the storefront's "up to 70% off" claim.
 */

export const LIQUIDATION_CATEGORIES = [
  "Consumer Electronics",
  "Open-Box Laptops",
  "Pallet Lots",
  "Home Goods",
  "Apparel",
] as const;

export type LiquidationCategory = (typeof LIQUIDATION_CATEGORIES)[number];
export type StockStatus = "In Stock" | "Low Stock" | "Sold Out";

export type LiquidationItem = {
  id: string;
  title: string;
  category: LiquidationCategory;
  originalRetailPrice: number;
  liquidationPrice: number;
  discountPercentage: number;
  initialStock: number;
  currentStock: number;
  imageUrl: string;
  status: StockStatus;
};

/** At or below this many units a card switches to "Only N left in stock!". */
export const LOW_STOCK_THRESHOLD = 5;

export function stockStatus(stock: number): StockStatus {
  if (stock <= 0) return "Sold Out";
  if (stock <= LOW_STOCK_THRESHOLD) return "Low Stock";
  return "In Stock";
}

// [title, category, retail price, target discount %, initial stock, image in public/products]
type Seed = [string, LiquidationCategory, number, number, number, string];

const SEEDS: Seed[] = [
  ["Wireless Noise-Cancelling Earbuds", "Consumer Electronics", 199.99, 65, 48, "headphones"],
  ['55" 4K QLED Smart TV (Open-Box)', "Consumer Electronics", 899.99, 55, 9, "tv"],
  ["Unlocked 128GB Smartphone (Grade A Refurb)", "Consumer Electronics", 699.0, 50, 22, "smartphone"],
  ["Fitness Smartwatch with GPS", "Consumer Electronics", 249.99, 62, 35, "watch"],
  ["Wireless Game Controller 2-Pack", "Consumer Electronics", 139.98, 58, 40, "gamepad"],
  ["Portable Bluetooth Speaker", "Consumer Electronics", 129.99, 66, 55, "speaker"],
  ["Mirrorless Camera Body (Open-Box)", "Consumer Electronics", 999.99, 48, 6, "camera"],
  ['10" Android Tablet, 64GB', "Consumer Electronics", 229.99, 60, 28, "tablet"],
  ["Over-Ear Studio Headphones", "Consumer Electronics", 349.99, 64, 14, "headphones"],
  ['27" QHD IPS Monitor (Open-Box)', "Consumer Electronics", 329.99, 57, 25, "monitor"],
  ["Soundbar with Wireless Subwoofer", "Consumer Electronics", 399.99, 63, 11, "speaker"],

  ['14" Ultrabook, i7 / 16GB / 512GB', "Open-Box Laptops", 1299.0, 52, 12, "laptop"],
  ['13" M2 Laptop (Open-Box, Grade A)', "Open-Box Laptops", 1099.0, 35, 8, "laptop"],
  ['15.6" Gaming Laptop, RTX 4060', "Open-Box Laptops", 1499.99, 45, 7, "laptop"],
  ['11.6" Chromebook (Education Lot)', "Open-Box Laptops", 279.99, 70, 45, "laptop"],
  ['13.3" 2-in-1 Convertible Laptop', "Open-Box Laptops", 899.99, 58, 15, "laptop"],
  ["Business Laptop i5 / 8GB (Lease Return)", "Open-Box Laptops", 849.0, 68, 30, "laptop"],
  ['16" OLED Creator Laptop', "Open-Box Laptops", 1899.99, 47, 5, "laptop"],

  ["General Merchandise Customer Returns Pallet", "Pallet Lots", 4500.0, 70, 6, "pallet"],
  ["Small Kitchen Appliances Pallet (~40 units)", "Pallet Lots", 3200.0, 69, 5, "pallet"],
  ["Toys & Games Overstock Pallet", "Pallet Lots", 2800.0, 70, 8, "gift"],
  ["Health & Beauty Shelf-Pull Pallet", "Pallet Lots", 2400.0, 68, 7, "package"],
  ["Home Décor Truckload (26 pallets)", "Pallet Lots", 78000.0, 70, 2, "truck"],
  ["Phone Accessories Case Pack (500 units)", "Pallet Lots", 7500.0, 70, 10, "package"],
  ["Power Tools Returns Pallet", "Pallet Lots", 5200.0, 66, 4, "wrench"],
  ["Mixed Apparel Case Lot (150 pcs)", "Pallet Lots", 4500.0, 70, 9, "package"],

  ["Mid-Century Accent Chair", "Home Goods", 349.0, 62, 18, "armchair"],
  ["Queen Memory Foam Mattress (Box-Damaged)", "Home Goods", 799.0, 65, 12, "bed"],
  ["7-Piece Nonstick Cookware Set", "Home Goods", 199.99, 64, 33, "cookware"],
  ["Espresso Machine with Milk Frother", "Home Goods", 499.99, 60, 10, "coffee"],
  ["3-Seat Fabric Sofa (Floor Model)", "Home Goods", 1299.0, 58, 4, "sofa"],
  ["Dimmable LED Floor Lamp", "Home Goods", 129.99, 70, 40, "lamp"],
  ["Robot Vacuum (Open-Box)", "Home Goods", 399.99, 62, 16, "vacuum"],
  ["HEPA Air Purifier", "Home Goods", 249.99, 66, 21, "purifier"],

  ["Insulated Winter Parka", "Apparel", 249.99, 70, 26, "shirt"],
  ["Running Shoes (Mixed Sizes)", "Apparel", 139.99, 68, 60, "shoes"],
  ["Polarized Sunglasses", "Apparel", 159.99, 70, 45, "glasses"],
  ["Leather Commuter Backpack", "Apparel", 199.99, 66, 20, "backpack"],
  ["Merino Wool Sweater", "Apparel", 119.99, 65, 38, "shirt"],
  ["Denim Jeans 5-Pack (Assorted)", "Apparel", 299.95, 70, 15, "shirt"],
  ["Waterproof Hiking Boots", "Apparel", 179.99, 64, 24, "shoes"],
];

const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const SEED_INVENTORY: readonly LiquidationItem[] = SEEDS.map(
  ([title, category, originalRetailPrice, targetDiscount, initialStock, image]) => {
    const liquidationPrice = Math.ceil((originalRetailPrice * (100 - targetDiscount)) / 100) - 0.01;
    return {
      id: slug(title),
      title,
      category,
      originalRetailPrice,
      liquidationPrice,
      discountPercentage: Math.round((1 - liquidationPrice / originalRetailPrice) * 100),
      initialStock,
      currentStock: initialStock,
      imageUrl: `/products/${image}.svg`,
      status: stockStatus(initialStock),
    };
  },
);
