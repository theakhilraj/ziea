import { unstable_cache } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createPublicClient } from "@/utils/supabase/public";
import { getCategories } from "@/utils/categories";
import type { Product } from "@/types/product";

// Single source of truth for the storefront product shape (detail pages).
const PRODUCT_SELECT = `
  id, product_code, name, description, category_id,
  original_price, discounted_price, material, care_instructions,
  shipping_info, contents, delivery_days, images, sizes, badges, is_published, status, created_at
`;

// Trimmed shape for listing/grid + filtering — omits the heavy long-form
// columns (description, care_instructions, shipping_info, contents) that the
// card never renders, cutting the payload the Collections page transfers.
const LIST_SELECT = `
  id, product_code, name, category_id, original_price, discounted_price,
  material, delivery_days, images, sizes, badges, created_at
`;

interface ListParams {
  category?: string; // category_id
  q?: string;
  page?: number;
  pageSize?: number;
}

/** Published products for the storefront, with optional category filter, search, and pagination. */
export async function getPublishedProducts({
  category,
  q,
  page = 1,
  pageSize = 12,
}: ListParams = {}): Promise<{ items: Product[]; total: number }> {
  const supabase = await createClient();

  let query = supabase
    .from("products")
    .select(PRODUCT_SELECT, { count: "exact" })
    .eq("is_published", true)
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (category) query = query.eq("category_id", category);
  if (q && q.trim()) {
    const term = q.trim().replace(/[%,]/g, "");
    query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
  }

  const from = (page - 1) * pageSize;
  query = query.range(from, from + pageSize - 1);

  const { data, count, error } = await query;
  if (error) console.error("getPublishedProducts:", error.message);
  return { items: (data ?? []) as Product[], total: count ?? 0 };
}

/** The effective (sale-aware) price used for price filtering and price sorting. */
function effectivePrice(p: Product): number {
  return p.discounted_price ?? p.original_price ?? 0;
}

/**
 * Published catalog rows for a given category/search, cached across requests.
 * The DB query only depends on (category, q) — all other Collections filters are
 * applied in-memory afterward — so caching this covers every filter/sort/page
 * combination for the same category+search. Public (cookie-less) client, tagged
 * `products`, invalidated on admin product changes with a 5-minute fallback.
 */
const getCatalogRows = unstable_cache(
  async (category?: string, q?: string): Promise<Product[]> => {
    const supabase = createPublicClient();
    let query = supabase
      .from("products")
      .select(`${LIST_SELECT}, view_count`)
      .eq("is_published", true)
      .eq("status", "published");

    if (category) query = query.eq("category_id", category);
    if (q && q.trim()) {
      const term = q.trim().replace(/[%,]/g, "");
      query = query.or(`name.ilike.%${term}%,description.ilike.%${term}%`);
    }

    const { data, error } = await query;
    if (error) console.error("getCatalogRows:", error.message);
    return (data ?? []) as Product[];
  },
  ["storefront-catalog"],
  { tags: ["products"], revalidate: 300 },
);

export type ProductSort = "newest" | "price_asc" | "price_desc" | "popular";

interface FilterParams {
  category?: string; // category_id
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  onSale?: boolean;
  badges?: string[];
  inStock?: boolean;
  sizes?: string[];
  materials?: string[];
  sort?: ProductSort;
  page?: number;
  pageSize?: number;
}

/**
 * Fetch-all + in-memory filter/sort for the storefront Collections page.
 * DB-level filtering is limited to `category` and `q` (search); everything else
 * (cross-column sale, JSONB stock/size, material, price bounds) is applied in JS
 * because the catalog is small and these predicates are awkward in the query builder.
 */
export async function getFilteredProducts({
  category,
  q,
  minPrice,
  maxPrice,
  onSale,
  badges,
  inStock,
  sizes,
  materials,
  sort = "newest",
  page = 1,
  pageSize = 12,
}: FilterParams = {}): Promise<{ items: Product[]; total: number }> {
  // Cached DB read (keyed by category + search) — matches product name/description.
  let items = await getCatalogRows(category, q);

  // Also let the search match CATEGORY names: if the query matches a category,
  // include that category's products (union, deduped). Skipped when the user is
  // already filtered to a specific category via the tabs.
  if (q && q.trim() && !category) {
    const term = q.trim().toLowerCase();
    const cats = await getCategories();
    const matchIds = cats
      .filter((c) => c.name.toLowerCase().includes(term))
      .map((c) => c.id);
    if (matchIds.length) {
      const seen = new Set(items.map((p) => p.id));
      const byCat = (await Promise.all(matchIds.map((id) => getCatalogRows(id)))).flat();
      items = [...items, ...byCat.filter((p) => !seen.has(p.id))];
    }
  }

  // Price bounds (each optional; NaN is guarded by the callers).
  if (typeof minPrice === "number" && !Number.isNaN(minPrice)) {
    items = items.filter((p) => effectivePrice(p) >= minPrice);
  }
  if (typeof maxPrice === "number" && !Number.isNaN(maxPrice)) {
    items = items.filter((p) => effectivePrice(p) <= maxPrice);
  }

  // On sale only.
  if (onSale) {
    items = items.filter(
      (p) =>
        p.discounted_price != null &&
        p.original_price != null &&
        p.discounted_price < p.original_price,
    );
  }

  // Badge/tag intersection.
  if (badges && badges.length > 0) {
    items = items.filter((p) =>
      (p.badges ?? []).some((b) => badges.includes(b)),
    );
  }

  // In stock only.
  if (inStock) {
    items = items.filter((p) => (p.sizes ?? []).some((s) => s.quantity > 0));
  }

  // Size: has ANY selected size with quantity > 0.
  if (sizes && sizes.length > 0) {
    items = items.filter((p) =>
      (p.sizes ?? []).some((s) => sizes.includes(s.size) && s.quantity > 0),
    );
  }

  // Material exact match against selected set.
  if (materials && materials.length > 0) {
    items = items.filter((p) => !!p.material && materials.includes(p.material));
  }

  // Sort.
  switch (sort) {
    case "price_asc":
      items.sort((a, b) => effectivePrice(a) - effectivePrice(b));
      break;
    case "price_desc":
      items.sort((a, b) => effectivePrice(b) - effectivePrice(a));
      break;
    case "popular":
      items.sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0));
      break;
    case "newest":
    default:
      items.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      break;
  }

  const total = items.length;
  const from = (page - 1) * pageSize;
  const paged = items.slice(from, from + pageSize);

  return { items: paged, total };
}

export interface ProductFacets {
  badges: string[];
  materials: string[];
  minPrice: number;
  maxPrice: number;
}

/**
 * Distinct filter option data computed from ALL published products. Cached
 * across requests (public client, tagged `products`, 5-minute fallback);
 * invalidated on admin product changes via `revalidateTag('products')`.
 */
export const getProductFacets = unstable_cache(
  async (): Promise<ProductFacets> => {
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("products")
    .select("original_price, discounted_price, material, badges")
    .eq("is_published", true)
    .eq("status", "published");
  if (error) console.error("getProductFacets:", error.message);

  const rows = (data ?? []) as Pick<
    Product,
    "original_price" | "discounted_price" | "material" | "badges"
  >[];

  const badgeSet = new Set<string>();
  const materialSet = new Set<string>();
  let min = Infinity;
  let max = 0;

  for (const r of rows) {
    for (const b of r.badges ?? []) if (b) badgeSet.add(b);
    if (r.material && r.material.trim()) materialSet.add(r.material.trim());
    const price = r.discounted_price ?? r.original_price ?? 0;
    if (price < min) min = price;
    if (price > max) max = price;
  }

  return {
    badges: [...badgeSet].sort((a, b) => a.localeCompare(b)),
    materials: [...materialSet].sort((a, b) => a.localeCompare(b)),
    minPrice: Number.isFinite(min) ? Math.floor(min) : 0,
    maxPrice: Math.ceil(max),
  };
  },
  ["storefront-facets"],
  { tags: ["products"], revalidate: 300 },
);

/**
 * Latest published products for the home "Latest Collections" grid. Cached
 * across requests (public client, tagged `products`, 5-minute fallback).
 */
export const getLatestProducts = unstable_cache(
  async (limit = 8): Promise<Product[]> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("products")
      .select(
        "id, product_code, name, category_id, original_price, discounted_price, images, badges, delivery_days",
      )
      .eq("is_published", true)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) console.error("getLatestProducts:", error.message);
    return (data ?? []) as Product[];
  },
  ["storefront-latest"],
  { tags: ["products"], revalidate: 300 },
);

/**
 * A single published product by its DB-generated product_code (the storefront slug).
 * Public (cookie-less) client + `unstable_cache` so the detail page serves from cache
 * and the double fetch (generateMetadata + page body) collapses to one query. Tagged
 * `products`, invalidated on admin product changes with a 5-minute fallback.
 */
export const getProductByCode = unstable_cache(
  async (code: string): Promise<Product | null> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("products")
      .select(PRODUCT_SELECT)
      .eq("product_code", code)
      .eq("is_published", true)
      .eq("status", "published")
      .maybeSingle();
    if (error) console.error("getProductByCode:", error.message);
    return (data ?? null) as Product | null;
  },
  ["storefront-product"],
  { tags: ["products"], revalidate: 300 },
);

/**
 * All published product slugs (+ last-modified) for the sitemap and
 * generateStaticParams. Cached (public client, tagged `products`).
 */
export const getAllPublishedSlugs = unstable_cache(
  async (): Promise<{ code: string; updatedAt: string; categoryId: string | null }[]> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("products")
      .select("product_code, created_at, category_id")
      .eq("is_published", true)
      .eq("status", "published");
    if (error) console.error("getAllPublishedSlugs:", error.message);
    return (data ?? []).map(
      (r: { product_code: string; created_at: string; category_id: string | null }) => ({
        code: r.product_code,
        updatedAt: r.created_at,
        categoryId: r.category_id,
      }),
    );
  },
  ["storefront-slugs"],
  { tags: ["products"], revalidate: 3600 },
);

/**
 * Related products in the same category (excluding the current one). Cached
 * (public client, tagged `products`, 5-minute fallback) like the rest of the
 * storefront reads — invalidated on admin product changes.
 */
export const getRelatedProducts = unstable_cache(
  async (
    categoryId: string | null,
    excludeId: string,
    limit = 4,
  ): Promise<Product[]> => {
    const supabase = createPublicClient();
    let query = supabase
      .from("products")
      .select(LIST_SELECT)
      .eq("is_published", true)
      .eq("status", "published")
      .neq("id", excludeId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (categoryId) query = query.eq("category_id", categoryId);
    const { data, error } = await query;
    if (error) console.error("getRelatedProducts:", error.message);
    return (data ?? []) as Product[];
  },
  ["storefront-related"],
  { tags: ["products"], revalidate: 300 },
);
