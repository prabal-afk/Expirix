import { addDays } from "./dates";
import { uid } from "./format";
import type { AppData, Batch, ISODate, Movement, Product, Settings } from "./types";

export const DEMO_SHOP_ID = "demo-shop";

export function defaultSettings(shopId: string, overrides: Partial<Settings> = {}): Settings {
  return {
    shop_id: shopId,
    shop_name: "My Shop",
    owner_name: "Owner",
    phone: "",
    email: "",
    address: "",
    expiry_threshold_days: 7,
    alert_upcoming_days: 30,
    alert_warning_days: 7,
    alert_high_days: 3,
    alert_critical_days: 1,
    low_stock_default: 5,
    currency: "INR",
    date_format: "DD/MM/YYYY",
    timezone: "Asia/Kolkata",
    in_app_alerts: true,
    browser_notifications: false,
    email_digest: true,
    ...overrides,
  };
}

// name, brand, category, unit, cost, price, minStock, supplier, batches
// batch: [expiry offset from today (days), quantity on hand, units already sold, age in days, batch no]
type Row = [string, string, string, string, number, number, number, string, [number, number, number, number, string][]];

const ROWS: Row[] = [
  ["Amul Taaza Milk 500ml", "Amul", "Dairy", "packs", 26, 28, 20, "Karnal Dairy Agency", [[0, 12, 18, 2, "AM-A"], [3, 20, 4, 1, "AM-B"]]],
  ["Mother Dairy Dahi 400g", "Mother Dairy", "Dairy", "packs", 34, 40, 10, "Karnal Dairy Agency", [[1, 8, 4, 5, "MD-D1"], [6, 15, 0, 1, "MD-D2"]]],
  ["Amul Butter 100g", "Amul", "Dairy", "packs", 52, 58, 8, "Karnal Dairy Agency", [[12, 10, 6, 20, "B-77"], [45, 18, 0, 3, "B-91"]]],
  ["Parle-G Gold 100g", "Parle", "Biscuits & Snacks", "packs", 8.5, 10, 30, "Gupta Wholesale", [[3, 20, 30, 70, "PG-24"], [120, 100, 20, 8, "PG-31"]]],
  ["Britannia Good Day Cashew 75g", "Britannia", "Biscuits & Snacks", "packs", 18, 20, 12, "Gupta Wholesale", [[-5, 6, 24, 120, "GD-08"], [60, 36, 4, 15, "GD-10"]]],
  ["Lay's Classic Salted 52g", "Lay's", "Biscuits & Snacks", "packs", 17, 20, 15, "Gupta Wholesale", [[25, 30, 10, 12, "LY-45"]]],
  ["Kurkure Masala Munch 90g", "Kurkure", "Biscuits & Snacks", "packs", 17, 20, 15, "Gupta Wholesale", [[9, 40, 12, 45, "KR-19"]]],
  ["Maggi 2-Minute Noodles 70g", "Nestlé", "Packaged Foods", "packs", 12, 14, 40, "Singla Traders", [[18, 35, 60, 90, "MG-52"], [150, 120, 30, 6, "MG-61"]]],
  ["Aashirvaad Atta 5kg", "Aashirvaad", "Packaged Foods", "packs", 245, 270, 6, "Singla Traders", [[100, 14, 8, 20, "AA-33"]]],
  ["Tata Salt 1kg", "Tata", "Packaged Foods", "packs", 24, 28, 20, "Singla Traders", [[400, 40, 20, 30, "TS-02"]]],
  ["Fortune Sunflower Oil 1L", "Fortune", "Packaged Foods", "bottles", 128, 142, 10, "Singla Traders", [[200, 22, 14, 14, "FO-07"]]],
  ["Kissan Mixed Fruit Jam 500g", "Kissan", "Packaged Foods", "bottles", 145, 165, 5, "Singla Traders", [[-12, 4, 6, 200, "KJ-03"], [28, 9, 3, 60, "KJ-05"]]],
  ["Frooti Mango 200ml", "Frooti", "Beverages", "bottles", 9, 10, 24, "Bharat Beverages", [[6, 48, 30, 100, "FR-61"]]],
  ["Coca-Cola 600ml", "Coca-Cola", "Beverages", "bottles", 32, 38, 12, "Bharat Beverages", [[5, 12, 18, 70, "CC-14"], [75, 30, 10, 12, "CC-22"]]],
  ["Colgate Strong Teeth 100g", "Colgate", "Personal Care", "pieces", 52, 60, 10, "City Distributors", [[300, 30, 12, 40, "CG-09"]]],
  ["Sunsilk Shampoo 180ml", "Sunsilk", "Personal Care", "bottles", 128, 145, 6, "City Distributors", [[15, 3, 5, 50, "SS-41"]]],
  ["Surf Excel Easy Wash 1kg", "Surf Excel", "Household", "packs", 118, 132, 6, "City Distributors", [[540, 18, 6, 22, "SE-26"]]],
  ["Vim Dishwash Gel 500ml", "Vim", "Household", "bottles", 98, 110, 5, "City Distributors", [[365, 12, 4, 18, "VM-05"]]],
];

// product name, type, quantity discarded, days ago — realistic waste history for the reports
const WASTE: [string, "expired_removed" | "damaged", number, number][] = [
  ["Amul Taaza Milk 500ml", "damaged", 2, 20],
  ["Amul Taaza Milk 500ml", "expired_removed", 6, 38],
  ["Amul Taaza Milk 500ml", "expired_removed", 4, 71],
  ["Mother Dairy Dahi 400g", "expired_removed", 5, 52],
  ["Mother Dairy Dahi 400g", "expired_removed", 8, 120],
  ["Britannia Good Day Cashew 75g", "expired_removed", 10, 95],
  ["Kissan Mixed Fruit Jam 500g", "expired_removed", 3, 140],
  ["Maggi 2-Minute Noodles 70g", "damaged", 4, 28],
  ["Parle-G Gold 100g", "expired_removed", 15, 85],
  ["Lay's Classic Salted 52g", "damaged", 3, 9],
  ["Amul Butter 100g", "expired_removed", 2, 33],
  ["Frooti Mango 200ml", "expired_removed", 10, 48],
  ["Kurkure Masala Munch 90g", "expired_removed", 12, 160],
];

const ts = (date: ISODate, hourUtc = 4) => `${date}T${String(hourUtc).padStart(2, "0")}:30:00.000Z`;

/**
 * Builds a realistic demo inventory. Every date is relative to `today`, so the examples
 * (expired / today / within 3, 7 and 30 days / safe) stay meaningful whenever the app is opened.
 */
export function buildSeed(today: ISODate, shopId = DEMO_SHOP_ID, makeId: () => string = uid): AppData {
  const products: Product[] = [];
  const batches: Batch[] = [];
  const movements: Movement[] = [];
  const productByName = new Map<string, Product>();
  const costByName = new Map<string, { cost: number; price: number; unit: string }>();

  ROWS.forEach(([name, brand, category, unit, cost, price, min, supplier, bs], i) => {
    const product: Product = {
      id: makeId(),
      shop_id: shopId,
      name,
      brand,
      category,
      barcode: `890900${String(100100 + i * 7).padStart(7, "0")}`,
      unit,
      min_stock: min,
      supplier,
      notes: null,
      created_at: ts(addDays(today, -200)),
    };
    products.push(product);
    productByName.set(name, product);
    costByName.set(name, { cost, price, unit });

    for (const [offset, qty, sold, age, batchNo] of bs) {
      const purchase = addDays(today, -age);
      const expiry = addDays(today, offset);
      const batch: Batch = {
        id: makeId(),
        shop_id: shopId,
        product_id: product.id,
        batch_no: batchNo,
        quantity: qty,
        initial_quantity: qty + sold,
        purchase_price: cost,
        selling_price: price,
        purchase_date: purchase,
        mfg_date: addDays(purchase, -Math.min(30, age + 5)),
        expiry_date: expiry,
        created_at: ts(purchase),
      };
      batches.push(batch);
      movements.push({
        id: makeId(),
        shop_id: shopId,
        product_id: product.id,
        batch_id: batch.id,
        product_name: name,
        batch_no: batchNo,
        unit,
        type: "received",
        qty_change: qty + sold,
        qty_after: qty + sold,
        unit_cost: cost,
        unit_price: price,
        notes: "Initial stock",
        created_at: ts(purchase),
      });
      if (sold > 0) {
        const soldDay = age >= 1 ? addDays(purchase, Math.min(age, 1)) : purchase;
        movements.push({
          id: makeId(),
          shop_id: shopId,
          product_id: product.id,
          batch_id: batch.id,
          product_name: name,
          batch_no: batchNo,
          unit,
          type: "sold",
          qty_change: -sold,
          qty_after: qty,
          unit_cost: cost,
          unit_price: price,
          notes: "Sold over the counter",
          created_at: ts(soldDay, 11),
        });
      }
    }
  });

  for (const [name, type, qty, ago] of WASTE) {
    const p = productByName.get(name)!;
    const c = costByName.get(name)!;
    movements.push({
      id: makeId(),
      shop_id: shopId,
      product_id: p.id,
      batch_id: null, // that batch was cleared long ago; the history is kept
      product_name: name,
      batch_no: null,
      unit: c.unit,
      type,
      qty_change: -qty,
      qty_after: 0,
      unit_cost: c.cost,
      unit_price: c.price,
      notes: type === "expired_removed" ? "Removed after expiry" : "Damaged in storage",
      created_at: ts(addDays(today, -ago), 12),
    });
  }

  movements.sort((a, b) => a.created_at.localeCompare(b.created_at));

  return {
    products,
    batches,
    movements,
    notifications: [], // generated from the batches by the alert planner
    settings: defaultSettings(shopId, {
      shop_name: "Rajesh Kirana Store",
      owner_name: "Rajesh Kumar",
      phone: "+91 98765 43210",
      email: "rajesh@example.com",
      address: "Sector 12 Market, Karnal, Haryana",
    }),
  };
}
