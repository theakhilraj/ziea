import { createClient } from "@/utils/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Types ───────────────────────────────────────────────────────────────────

export interface BarDatum {
  label: string;
  /** Optional secondary line under the axis label (e.g. the date under a weekday). */
  subLabel?: string;
  value: number;
}

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

export interface ActivityItem {
  imageUrl?: string;
  title: string;
  subtitle: string;
  rightPrimary?: string;
  tone?: "sage" | "terracotta" | "error" | "muted";
  href?: string;
}

export type InteractionRange = "daily" | "weekly" | "monthly";
export type SalesInvoiceRange = "all_time" | "this_month" | "last_3_months";
export type SalesInvoiceKind = "all" | "gst" | "normal";

export interface SalesInvoiceBucket {
  label: string;
  invoiced: number;
  collected: number;
}

export interface SalesInvoiceAnalytics {
  range: SalesInvoiceRange;
  invoiceKind: SalesInvoiceKind;
  selectedMonth: string;
  invoiceCount: number;
  invoiced: number;
  collected: number;
  outstanding: number;
  buckets: SalesInvoiceBucket[];
}

export interface ProductViewRow {
  productCode: string;
  name: string;
  views: number;
}

export interface AnalyticsData {
  stats: {
    totalProducts: number;
    totalViews: number;
    wishlisted: number;
    cartCount: number;
  };
  trend: {
    range: InteractionRange;
    offset: number;
    windowLabel: string;
    bars: BarDatum[];
  };
  popularProducts: DonutSegment[];
  topProduct: { title: string; value: string };
  /** Top 5 products by view count (preview list on the Analytics page). */
  productViews: ProductViewRow[];
  wishlistActivity: ActivityItem[];
  cartAdditions: ActivityItem[];
  /** WhatsApp order pipeline counts by status. */
  orders: {
    total: number;
    initiated: number;
    confirmed: number;
    fulfilled: number;
    cancelled: number;
  };
  salesInvoices: SalesInvoiceAnalytics;
}

// ── Palette ───────────────────────────────────────────────────────────────────

export const DONUT_PALETTE = [
  "#4c623d",
  "#C4856A",
  "#7A7068",
  "#865139",
  "#A8BC9A",
  "#2C3829",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Admin-noise exclusion: keep only customer-facing activity. Rows whose `type`
 * matches Admin/Product/Category are dropped, leaving Customer Login/Registration,
 * Wishlist, Cart, Enquiry, and Newsletter.
 */
const ADMIN_EXCLUDE_RE = /(Admin|Product|Category)/i;

const WEEKDAY_MON = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Monday-based start of the week containing `d`. */
function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - day);
  return x;
}

function startOfMonth(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(1);
  return x;
}

function businessDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value])) as Record<string, string>;
}

function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

function monthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    year: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(Date.UTC(year, month, 1)));
}

function salesFinancialYear(date: string) {
  const [year, month] = date.split("-").map(Number);
  const startYear = month >= 4 ? year : year - 1;
  return { key: startYear, label: `FY ${String(startYear % 100).padStart(2, "0")}-${String((startYear + 1) % 100).padStart(2, "0")}` };
}

/**
 * Summarize issued invoices and build the range-specific invoiced/collected chart.
 * Draft and cancelled records are excluded so the figures represent issued business.
 */
export async function buildSalesInvoiceAnalytics(
  supabase: SupabaseClient,
  range: SalesInvoiceRange,
  selectedMonth?: string,
  invoiceKind: SalesInvoiceKind = "all",
): Promise<SalesInvoiceAnalytics> {
  const today = businessDateParts();
  const currentMonth = Number(today.month) - 1;
  const currentYear = Number(today.year);
  const currentMonthKey = monthKey(currentYear, currentMonth);
  const effectiveMonth = selectedMonth ?? currentMonthKey;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(effectiveMonth)) {
    throw new Error("A valid month is required for sales invoice analytics.");
  }
  const [selectedYear, selectedMonthNumber] = (effectiveMonth ?? currentMonthKey).split("-").map(Number);
  if (selectedYear > currentYear || (selectedYear === currentYear && selectedMonthNumber > currentMonth + 1)) {
    throw new Error("Future months are not available for sales invoice analytics.");
  }
  const rangeStart = new Date(Date.UTC(selectedYear, selectedMonthNumber - 1, 1));
  if (range === "last_3_months") rangeStart.setUTCMonth(rangeStart.getUTCMonth() - 2);
  const startDate = range === "all_time"
    ? null
    : `${rangeStart.getUTCFullYear()}-${String(rangeStart.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const selectedMonthEnd = new Date(Date.UTC(selectedYear, selectedMonthNumber, 1));
  const endExclusive = effectiveMonth === currentMonthKey
    ? new Date(Date.UTC(Number(today.year), currentMonth, Number(today.day) + 1))
    : selectedMonthEnd;
  const endExclusiveDate = `${endExclusive.getUTCFullYear()}-${String(endExclusive.getUTCMonth() + 1).padStart(2, "0")}-${String(endExclusive.getUTCDate()).padStart(2, "0")}`;

  type InvoiceAmounts = {
    id: string;
    invoice_date: string;
    grand_total: number | string | null;
    amount_paid: number | string | null;
    outstanding: number | string | null;
  };

  const fetchRows = async (applyInvoiceKind: boolean) => {
    const result: InvoiceAmounts[] = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      let query = supabase
        .from("sale_invoices")
        .select("id, invoice_date, grand_total, amount_paid, outstanding")
        .eq("status", "saved")
        .order("invoice_date", { ascending: true })
        .order("id", { ascending: true })
        .lt("invoice_date", endExclusiveDate)
        .range(offset, offset + pageSize - 1);
      if (startDate) query = query.gte("invoice_date", startDate);
      if (applyInvoiceKind && invoiceKind !== "all") query = query.eq("invoice_kind", invoiceKind);
      const { data, error } = await query;
      if (error) return { rows: result, error };
      const page = (data ?? []) as InvoiceAmounts[];
      result.push(...page);
      if (page.length < pageSize) break;
    }
    return { rows: result, error: null };
  };

  let { rows, error } = await fetchRows(invoiceKind !== "all");
  if (error && invoiceKind === "gst" && error.message.toLowerCase().includes("invoice_kind")) {
    ({ rows, error } = await fetchRows(false));
  }
  if (error) throw new Error(`Could not load sales invoice analytics: ${error.message}`);

  const buckets = new Map<string, SalesInvoiceBucket & { sortKey: number }>();
  const ensureBucket = (key: string, label: string, sortKey: number) => {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { label, invoiced: 0, collected: 0, sortKey };
      buckets.set(key, bucket);
    }
    return bucket;
  };

  for (const row of rows) {
    const date = row.invoice_date;
    const [year, month, day] = date.split("-").map(Number);
    let bucket: SalesInvoiceBucket & { sortKey: number };

    if (range === "this_month") {
      const week = Math.floor((day - 1) / 7) + 1;
      bucket = ensureBucket(`week-${week}`, `Week ${week}`, week);
    } else if (range === "last_3_months") {
      const key = monthKey(year, month - 1);
      bucket = ensureBucket(key, monthLabel(year, month - 1), year * 12 + month - 1);
    } else {
      const financialYear = salesFinancialYear(date);
      bucket = ensureBucket(String(financialYear.key), financialYear.label, financialYear.key);
    }

    bucket.invoiced += Number(row.grand_total ?? 0);
    bucket.collected += Number(row.amount_paid ?? 0);
  }

  if (range === "this_month") {
    for (let week = 1; week <= 5; week += 1) ensureBucket(`week-${week}`, `Week ${week}`, week);
  } else if (range === "last_3_months") {
    for (let offset = 2; offset >= 0; offset -= 1) {
      const date = new Date(Date.UTC(selectedYear, selectedMonthNumber - 1 - offset, 1));
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth();
      ensureBucket(monthKey(year, month), monthLabel(year, month), year * 12 + month);
    }
  }

  return {
    range,
    invoiceKind,
    selectedMonth: effectiveMonth ?? currentMonthKey,
    invoiceCount: rows.length,
    invoiced: rows.reduce((total, row) => total + Number(row.grand_total ?? 0), 0),
    collected: rows.reduce((total, row) => total + Number(row.amount_paid ?? 0), 0),
    outstanding: rows.reduce((total, row) => total + Number(row.outstanding ?? 0), 0),
    buckets: [...buckets.values()]
      .sort((a, b) => a.sortKey - b.sortKey)
      .map(({ label, invoiced, collected }) => ({ label, invoiced, collected })),
  };
}

interface Bucket {
  label: string;
  subLabel?: string;
  start: number; // inclusive (ms)
  end: number; // exclusive (ms)
  value: number;
}

/**
 * Build a zero-filled interaction time-series from `activity_logs`, excluding
 * admin-noise rows. `offset` pages backwards in whole windows (0 = current window).
 */
export async function buildInteractionSeries(
  supabase: SupabaseClient,
  range: InteractionRange,
  offset: number,
): Promise<{ bars: BarDatum[]; windowLabel: string }> {
  const now = new Date();
  const buckets: Bucket[] = [];
  let windowStart: Date;
  let windowEnd: Date;
  let windowLabel: string;

  if (range === "daily") {
    // Fixed Mon–Sun calendar week containing (now − offset weeks).
    const weekStart = startOfWeek(new Date(now.getTime() - offset * 7 * DAY_MS)); // Monday
    for (let i = 0; i < 7; i++) {
      const dayStart = new Date(weekStart.getTime() + i * DAY_MS);
      const dayEnd = new Date(dayStart.getTime() + DAY_MS);
      buckets.push({
        label: WEEKDAY_MON[i],
        subLabel: String(dayStart.getDate()), // date under the weekday
        start: dayStart.getTime(),
        end: dayEnd.getTime(),
        value: 0,
      });
    }
    const lastDay = new Date(weekStart.getTime() + 6 * DAY_MS);
    windowStart = weekStart;
    windowEnd = new Date(weekStart.getTime() + 7 * DAY_MS);
    windowLabel =
      weekStart.getMonth() === lastDay.getMonth()
        ? `${weekStart.getDate()}–${lastDay.getDate()} ${MONTH_SHORT[lastDay.getMonth()]} ${lastDay.getFullYear()}`
        : `${weekStart.getDate()} ${MONTH_SHORT[weekStart.getMonth()]} – ${lastDay.getDate()} ${MONTH_SHORT[lastDay.getMonth()]} ${lastDay.getFullYear()}`;
  } else if (range === "weekly") {
    // 8 weeks ending at now − offset*8w.
    const endWeek = startOfWeek(new Date(now.getTime() - offset * 8 * 7 * DAY_MS));
    const firstWeek = new Date(endWeek.getTime() - 7 * 7 * DAY_MS);
    for (let i = 0; i < 8; i++) {
      const wkStart = new Date(firstWeek.getTime() + i * 7 * DAY_MS);
      const wkEnd = new Date(wkStart.getTime() + 7 * DAY_MS);
      buckets.push({
        // Split into date + month so it stays legible on mobile (no truncation).
        label: String(wkStart.getDate()),
        subLabel: MONTH_SHORT[wkStart.getMonth()],
        start: wkStart.getTime(),
        end: wkEnd.getTime(),
        value: 0,
      });
    }
    windowStart = firstWeek;
    windowEnd = new Date(endWeek.getTime() + 7 * DAY_MS);
    windowLabel = `${firstWeek.getDate()} ${MONTH_SHORT[firstWeek.getMonth()]} – ${endWeek.getDate()} ${MONTH_SHORT[endWeek.getMonth()]} ${endWeek.getFullYear()}`;
  } else {
    // monthly: 6 months ending at now − offset*6m.
    const anchor = startOfMonth(now);
    anchor.setMonth(anchor.getMonth() - offset * 6);
    const firstMonth = new Date(anchor);
    firstMonth.setMonth(firstMonth.getMonth() - 5);
    for (let i = 0; i < 6; i++) {
      const mStart = new Date(firstMonth);
      mStart.setMonth(mStart.getMonth() + i);
      const mEnd = new Date(mStart);
      mEnd.setMonth(mEnd.getMonth() + 1);
      buckets.push({
        label: MONTH_SHORT[mStart.getMonth()],
        start: mStart.getTime(),
        end: mEnd.getTime(),
        value: 0,
      });
    }
    windowStart = firstMonth;
    const lastMonthEnd = new Date(anchor);
    lastMonthEnd.setMonth(lastMonthEnd.getMonth() + 1);
    windowEnd = lastMonthEnd;
    // e.g. "Jun 2026" (the last month in the window)
    windowLabel = `${MONTH_SHORT[anchor.getMonth()]} ${anchor.getFullYear()}`;
  }

  const { data, error } = await supabase
    .from("activity_logs")
    .select("type, created_at")
    .gte("created_at", windowStart.toISOString())
    .lt("created_at", windowEnd.toISOString());

  if (error) console.error("buildInteractionSeries:", error.message);

  const rows = (data ?? []) as { type: string | null; created_at: string }[];

  for (const row of rows) {
    if (ADMIN_EXCLUDE_RE.test(row.type ?? "")) continue;
    const t = new Date(row.created_at).getTime();
    const bucket = buckets.find((b) => t >= b.start && t < b.end);
    if (bucket) bucket.value += 1;
  }

  return {
    bars: buckets.map((b) => ({ label: b.label, subLabel: b.subLabel, value: b.value })),
    windowLabel,
  };
}

// ── Main query ────────────────────────────────────────────────────────────────

interface ActivityRelRow {
  product_id: string;
  created_at: string;
  products: { name: string | null; images: { url?: string }[] | null } | null;
}

/** Aggregate wishlist/cart rows by product into ActivityItems (newest first, capped). */
function aggregateActivity(
  rows: ActivityRelRow[],
  subtitleFor: (n: number) => string,
  tone: ActivityItem["tone"],
  href: string,
  cap = 5,
): ActivityItem[] {
  // Preserve newest-first order of first appearance.
  const order: string[] = [];
  const map = new Map<string, { count: number; row: ActivityRelRow }>();

  for (const r of rows) {
    const existing = map.get(r.product_id);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(r.product_id, { count: 1, row: r });
      order.push(r.product_id);
    }
  }

  return order.slice(0, cap).map((id) => {
    const { count, row } = map.get(id)!;
    return {
      imageUrl: row.products?.images?.[0]?.url,
      title: row.products?.name ?? "Unknown product",
      subtitle: subtitleFor(count),
      tone,
      href,
    };
  });
}

/** Fetch every metric for the admin Analytics page in a single Promise.all. */
export async function getAnalytics(): Promise<AnalyticsData> {
  const supabase = await createClient();

  const [
    productsCountRes,
    viewsRes,
    wishlistCountRes,
    cartCountRes,
    popularRes,
    wishlistActivityRes,
    cartActivityRes,
    ordersRes,
    trend,
    salesInvoices,
  ] = await Promise.all([
    supabase.from("products").select("*", { count: "exact", head: true }),
    supabase.from("products").select("view_count"),
    supabase.from("wishlist_items").select("*", { count: "exact", head: true }),
    supabase.from("cart_items").select("*", { count: "exact", head: true }),
    supabase.from("products").select("product_code, name, view_count"),
    supabase
      .from("wishlist_items")
      .select("product_id, created_at, products(name, images)")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("cart_items")
      .select("product_id, created_at, products(name, images)")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("orders").select("status"),
    buildInteractionSeries(supabase, "daily", 0),
    buildSalesInvoiceAnalytics(supabase, "all_time"),
  ]);

  const totalProducts = productsCountRes.count ?? 0;

  const viewRows = (viewsRes.data ?? []) as { view_count: number | null }[];
  const totalViews = viewRows.reduce((sum, r) => sum + (r.view_count ?? 0), 0);

  const wishlisted = wishlistCountRes.count ?? 0;
  const cartCount = cartCountRes.count ?? 0;

  // Popular products (top 5 by view_count desc).
  const popularRows = (popularRes.data ?? []) as {
    product_code: string;
    name: string | null;
    view_count: number | null;
  }[];
  const sortedPopular = [...popularRows].sort(
    (a, b) => (b.view_count ?? 0) - (a.view_count ?? 0),
  );
  const top5 = sortedPopular.slice(0, 5);
  const popularProducts: DonutSegment[] = top5.map((p, i) => ({
    label: p.name ?? "Unnamed",
    value: p.view_count ?? 0,
    color: DONUT_PALETTE[i % DONUT_PALETTE.length],
  }));

  // Top 5 products by views (product + code + view count) for the preview table.
  const productViews: ProductViewRow[] = top5.map((p) => ({
    productCode: p.product_code ?? "—",
    name: p.name ?? "Unnamed",
    views: p.view_count ?? 0,
  }));

  const topRow = sortedPopular[0];
  const topProduct =
    topRow && (topRow.view_count ?? 0) > 0
      ? { title: topRow.name ?? "—", value: `${topRow.view_count} views` }
      : { title: "—", value: "No views yet" };

  const wishlistActivity = aggregateActivity(
    (wishlistActivityRes.data ?? []) as unknown as ActivityRelRow[],
    (n) => `Added by ${n} user${n === 1 ? "" : "s"}`,
    "terracotta",
    "/admin/analytics/wishlist",
  );

  const cartAdditions = aggregateActivity(
    (cartActivityRes.data ?? []) as unknown as ActivityRelRow[],
    (n) => `In ${n} cart${n === 1 ? "" : "s"}`,
    "sage",
    "/admin/analytics/cart",
  );

  // Order pipeline counts by status.
  const orderRows = (ordersRes.data ?? []) as { status: string | null }[];
  const orders = {
    total: orderRows.length,
    initiated: orderRows.filter((o) => o.status === "Initiated").length,
    confirmed: orderRows.filter((o) => o.status === "Confirmed").length,
    fulfilled: orderRows.filter((o) => o.status === "Fulfilled").length,
    cancelled: orderRows.filter((o) => o.status === "Cancelled").length,
  };

  return {
    stats: { totalProducts, totalViews, wishlisted, cartCount },
    orders,
    salesInvoices,
    trend: {
      range: "daily",
      offset: 0,
      windowLabel: trend.windowLabel,
      bars: trend.bars,
    },
    popularProducts,
    topProduct,
    productViews,
    wishlistActivity,
    cartAdditions,
  };
}
