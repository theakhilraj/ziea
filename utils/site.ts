// Single source of truth for the site's canonical identity — used by
// metadata, robots, sitemap, manifest, and JSON-LD so URLs stay consistent.

/** Canonical production origin (no trailing slash). Override via env in prod.
 *  Currently the live Vercel deployment; switch NEXT_PUBLIC_SITE_URL to the
 *  custom domain (e.g. https://ziea.in) once it's connected. */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://ziea.in"
).replace(/\/$/, "");

export const SITE_NAME = "ZIEA";

export const SITE_TAGLINE = "Premium Kerala Women's Wear";

export const SITE_DESCRIPTION =
  "ZIEA - premium Kerala women's wear. Discover handcrafted kurthis, nightwear, and everyday elegance rooted in slow, natural luxury.";

/** Build an absolute URL from a site-relative path. */
export function absoluteUrl(path = "/"): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
