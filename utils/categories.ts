import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/utils/supabase/public";
import { slugifyCategory, CATEGORY_FALLBACK_SLUG } from "@/utils/slug";

export interface StoreCategory {
  id: string;
  name: string;
  /** URL-friendly slug derived from `name` (no DB column). Decorates product URLs. */
  slug: string;
  image_url: string;
  /** Product-model crop, normalized from the DB columns for SmartImage. */
  cropX: number; // 0–100
  cropY: number; // 0–100
  zoom: number; // percent (100 = fit)
}

/** Normalize the legacy category crop columns into the product crop model.
 *  image_pos_x/y were stored as "50%" (or numbers); image_zoom was a ×multiplier
 *  (1) — values <= 5 are treated as legacy multipliers and scaled to percent. */
function normalizeCrop(row: {
  image_pos_x?: string | number | null;
  image_pos_y?: string | number | null;
  image_zoom?: string | number | null;
}) {
  const cropX = parseInt(String(row.image_pos_x ?? "50"), 10);
  const cropY = parseInt(String(row.image_pos_y ?? "50"), 10);
  const rawZoom = parseFloat(String(row.image_zoom ?? "100"));
  const zoom = !rawZoom ? 100 : rawZoom <= 5 ? rawZoom * 100 : rawZoom;
  return {
    cropX: Number.isNaN(cropX) ? 50 : cropX,
    cropY: Number.isNaN(cropY) ? 50 : cropY,
    zoom,
  };
}

/**
 * Storefront categories, ordered by creation.
 *
 * Cached across requests with `unstable_cache` so the Footer (every page),
 * Collections, and CategoryPills don't each hit Supabase. Invalidated instantly
 * when an admin changes categories via `revalidateTag('categories')`, with a
 * 1-hour fallback. Uses the cookie-less public client (required inside a cache).
 */
export const getCategories = unstable_cache(
  async (): Promise<StoreCategory[]> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("categories")
      .select("id, name, image_url, image_pos_x, image_pos_y, image_zoom")
      .order("created_at", { ascending: true });
    return (data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      slug: slugifyCategory(row.name as string),
      image_url: row.image_url as string,
      ...normalizeCrop(row),
    }));
  },
  ["storefront-categories"],
  { tags: ["categories"], revalidate: 3600 },
);

/**
 * Resolve a category id into its URL slug, using the (cached) category list.
 * Returns the fallback segment when the id is null or unknown, so product URLs
 * always have a valid category segment.
 */
export function slugForCategoryId(
  categories: StoreCategory[],
  id: string | null,
): string {
  if (!id) return CATEGORY_FALLBACK_SLUG;
  return categories.find((c) => c.id === id)?.slug ?? CATEGORY_FALLBACK_SLUG;
}
