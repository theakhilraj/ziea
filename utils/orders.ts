// Shared order constants + types + PURE helpers. Kept free of any server-only
// imports (no next/headers, no supabase/server) so BOTH server components AND
// client components ("use client") can import from here safely. Server-only
// fetchers live in ./orders.server.

export const ORDER_STATUSES = ["Initiated", "Confirmed", "Fulfilled", "Cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export interface Order {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  product_id: string | null;
  product_code: string | null;
  product_name: string | null;
  size: string | null;
  quantity: number;
  unit_price: number;
  subtotal: number;
  status: OrderStatus;
  source: string | null;
  order_group_id: string | null;
  order_number: string | null;
  created_at: string;
}

// ── Customer-facing "My Orders" shapes ──────────────────────────────────────
// One order (a checkout) folds many line-item rows together.

export interface CustomerOrderItem {
  id: string;
  productId: string | null;
  productCode: string | null;
  categorySlug?: string;
  productName: string | null;
  size: string | null;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  status: OrderStatus;
  image: string;
}

export interface CustomerOrder {
  /** Stable key for routing/keys: order_group_id when present, else the row id. */
  groupId: string;
  orderNumber: string | null;
  createdAt: string;
  source: string | null;
  /** Overall status rolled up from the line items. */
  status: OrderStatus;
  /** Total quantity across line items. */
  itemCount: number;
  total: number;
  items: CustomerOrderItem[];
}

/** A flattened line-item row the server builds before grouping. */
export interface OrderRowLite extends CustomerOrderItem {
  groupKey: string;
  orderNumber: string | null;
  createdAt: string;
  source: string | null;
}

/**
 * Roll many line-item statuses into one status for the whole order:
 *  - every item cancelled            → Cancelled
 *  - every active item fulfilled     → Fulfilled
 *  - any active item confirmed/ahead → Confirmed
 *  - otherwise                       → Initiated (still awaiting confirmation)
 */
export function aggregateStatus(items: { status: OrderStatus }[]): OrderStatus {
  const active = items.filter((i) => i.status !== "Cancelled");
  if (active.length === 0) return "Cancelled";
  if (active.every((i) => i.status === "Fulfilled")) return "Fulfilled";
  if (active.some((i) => i.status === "Confirmed" || i.status === "Fulfilled"))
    return "Confirmed";
  return "Initiated";
}

/** Group flattened rows into orders, newest first. */
export function groupOrders(rows: OrderRowLite[]): CustomerOrder[] {
  const map = new Map<string, CustomerOrder>();

  for (const r of rows) {
    let g = map.get(r.groupKey);
    if (!g) {
      g = {
        groupId: r.groupKey,
        orderNumber: r.orderNumber,
        createdAt: r.createdAt,
        source: r.source,
        status: "Initiated",
        itemCount: 0,
        total: 0,
        items: [],
      };
      map.set(r.groupKey, g);
    }
    g.items.push({
      id: r.id,
      productId: r.productId,
      productCode: r.productCode,
      categorySlug: r.categorySlug,
      productName: r.productName,
      size: r.size,
      quantity: r.quantity,
      unitPrice: r.unitPrice,
      subtotal: r.subtotal,
      status: r.status,
      image: r.image,
    });
    g.itemCount += r.quantity;
    g.total += r.subtotal;
    if (r.createdAt > g.createdAt) g.createdAt = r.createdAt;
    if (!g.orderNumber && r.orderNumber) g.orderNumber = r.orderNumber;
  }

  const groups = [...map.values()];
  for (const g of groups) g.status = aggregateStatus(g.items);
  groups.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return groups;
}

/** The customer-facing key for an order's detail URL. */
export function orderKey(o: CustomerOrder): string {
  return o.orderNumber ?? o.groupId;
}

/**
 * Mint a fresh group id + short order number for one checkout. Called client-side
 * at checkout (Buy Now / cart), stamped on every line item so they read back as
 * a single order. Format: ZIEA-YYMM-XXXX (X = base36 time+random for uniqueness).
 */
export function newOrderGroup(): { orderGroupId: string; orderNumber: string } {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const suffix = (
    (d.getTime() % 1_000_000).toString(36) + Math.random().toString(36).slice(2, 5)
  )
    .toUpperCase()
    .slice(-5);
  return {
    orderGroupId: crypto.randomUUID(),
    orderNumber: `ZIEA-${yy}${mm}-${suffix}`,
  };
}
