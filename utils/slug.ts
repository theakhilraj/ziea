// Client-safe, pure URL helpers. No server imports — safe to use in Client
// Components (e.g. ProductCard) as well as server code, sitemap, and metadata.

/** Fallback category segment for products that have no category. */
export const CATEGORY_FALLBACK_SLUG = "all";

/**
 * Derive a URL-friendly slug from a category name.
 * "Nightwear" → "nightwear", "Night Wear" → "night-wear".
 * Used one-directionally (category → slug) to decorate product URLs; the
 * product itself always resolves by its `product_code`, so slug collisions
 * between two categories are harmless.
 */
export function slugifyCategory(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // non-alphanumerics → dash
    .replace(/^-+|-+$/g, "") // trim leading/trailing dashes
    || CATEGORY_FALLBACK_SLUG;
}

/**
 * Canonical storefront path for a product: `/collections/{category}/{code}`.
 * When the category slug is unknown, falls back to the flat legacy path, which
 * 308-redirects to the canonical URL.
 */
export function productPath(productCode: string, categorySlug?: string | null): string {
  return categorySlug
    ? `/collections/${categorySlug}/${productCode}`
    : `/collections/${productCode}`;
}
