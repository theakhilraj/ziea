// Server-only "My Orders" data access. Imports next/headers-backed Supabase, so
// this must NEVER be imported from a "use client" module. Pure types/helpers it
// builds on live in ./orders (client-safe).
import { createClient } from "@/utils/supabase/server";
import { getUserId } from "@/utils/supabase/user";
import { getCategories, slugForCategoryId } from "@/utils/categories";
import {
  groupOrders,
  type CustomerOrder,
  type OrderRowLite,
  type OrderStatus,
} from "@/utils/orders";

// Columns pulled for the customer views. Supabase widens a to-one join to an
// array, so accept both shapes.
type JoinedProduct = {
  images: { url: string }[] | null;
  category_id: string | null;
};

interface OrderRow {
  id: string;
  order_group_id: string | null;
  order_number: string | null;
  created_at: string;
  source: string | null;
  status: OrderStatus;
  product_id: string | null;
  product_code: string | null;
  product_name: string | null;
  size: string | null;
  quantity: number | null;
  unit_price: number | null;
  subtotal: number | null;
  products: JoinedProduct | JoinedProduct[] | null;
}

const SELECT =
  "id, order_group_id, order_number, created_at, source, status, product_id, product_code, product_name, size, quantity, unit_price, subtotal, products(images, category_id)";

function toRowLite(
  row: OrderRow,
  categories: Awaited<ReturnType<typeof getCategories>>,
): OrderRowLite {
  const product = Array.isArray(row.products) ? row.products[0] : row.products;
  const qty = row.quantity ?? 1;
  const unit = row.unit_price ?? 0;
  return {
    id: row.id,
    groupKey: row.order_group_id ?? row.id,
    orderNumber: row.order_number,
    createdAt: row.created_at,
    source: row.source,
    productId: row.product_id,
    productCode: row.product_code,
    categorySlug: product ? slugForCategoryId(categories, product.category_id) : undefined,
    productName: row.product_name,
    size: row.size,
    quantity: qty,
    unitPrice: unit,
    subtotal: row.subtotal ?? unit * qty,
    status: row.status,
    image: product?.images?.[0]?.url ?? "/placeholder-product.jpg",
  };
}

/** All of the signed-in customer's orders, grouped and newest first. */
export async function getUserOrders(): Promise<CustomerOrder[]> {
  const userId = await getUserId();
  if (!userId) return [];

  const supabase = await createClient();
  const [{ data }, categories] = await Promise.all([
    supabase
      .from("orders")
      .select(SELECT)
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    getCategories(),
  ]);

  const rows = ((data ?? []) as OrderRow[]).map((r) => toRowLite(r, categories));
  return groupOrders(rows);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A single order by its customer-facing key — an order_number ("ZIEA-…") or, for
 * legacy rows with no number, a UUID (order_group_id or the row id). Scoped to the
 * current user, so one customer can never open another's order. Null if not found.
 */
export async function getUserOrderByKey(key: string): Promise<CustomerOrder | null> {
  const userId = await getUserId();
  if (!userId) return null;

  const supabase = await createClient();
  let query = supabase.from("orders").select(SELECT).eq("user_id", userId);
  query = UUID_RE.test(key)
    ? query.or(`order_group_id.eq.${key},id.eq.${key}`)
    : query.eq("order_number", key);

  const [{ data }, categories] = await Promise.all([query, getCategories()]);
  const rows = ((data ?? []) as OrderRow[]).map((r) => toRowLite(r, categories));
  if (rows.length === 0) return null;
  return groupOrders(rows)[0] ?? null;
}
