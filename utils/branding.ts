// Client-safe: types, editor schema, and pure parsers only (no server imports).
// The cached server fetcher lives in ./branding.server.ts.

/** Shared crop model — identical to products/categories, feeds SmartImage. */
export interface BrandImage {
  url: string;
  cropX: number;
  cropY: number;
  zoom: number;
}

export interface HeroSlide {
  id: string;
  desktop: BrandImage | null;
  mobile: BrandImage | null;
  headline: string;
  subHeadline: string;
}

export interface HomeBranding {
  heroSlides: HeroSlide[];
}
export interface AboutBranding {
  hero: BrandImage | null;
  mobileSlides: BrandImage[];
  craftsmanship: BrandImage[];
  philosophy: BrandImage | null;
}
export interface AuthBranding {
  topLeft: BrandImage | null;
  bottomRight: BrandImage | null;
}

export const SECTION = {
  home: "Home Page",
  about: "About Us",
  auth: "Auth Section",
} as const;

// ── Editor schema (drives the section-aware admin editor) ─────────────────────
export interface SlotDef {
  key: string;
  label: string;
  kind: "single" | "list";
  aspect: string; // e.g. "16/9"
  folder: string; // upload folder under cdn/
  hint?: string;
}

export type SectionSchema =
  | { kind: "home" }
  | { kind: "slots"; slots: SlotDef[] };

export const BRANDING_SCHEMA: Record<string, SectionSchema> = {
  [SECTION.home]: { kind: "home" },
  [SECTION.about]: {
    kind: "slots",
    slots: [
      { key: "hero", label: "Hero (desktop sticky)", kind: "single", aspect: "3/4", folder: "branding/about", hint: "Tall portrait shown beside the story on desktop." },
      { key: "mobileSlides", label: "Mobile Slides", kind: "list", aspect: "1/1", folder: "branding/about", hint: "Shown in the mobile image slider." },
      { key: "craftsmanship", label: "Craftsmanship Images", kind: "list", aspect: "16/10", folder: "branding/about", hint: "Cards in the craftsmanship carousel." },
      { key: "philosophy", label: "Philosophy Background", kind: "single", aspect: "16/9", folder: "branding/about", hint: "Full-bleed background behind the quote." },
    ],
  },
  [SECTION.auth]: {
    kind: "slots",
    slots: [
      { key: "topLeft", label: "Top-Left Card", kind: "single", aspect: "3/4", folder: "branding/auth" },
      { key: "bottomRight", label: "Bottom-Right Card", kind: "single", aspect: "3/4", folder: "branding/auth" },
    ],
  },
};

/**
 * Recommended upload resolution (px) for an aspect ratio like "16/9".
 * Landscape ratios anchor at 1920px wide; portrait/square at 1080px wide.
 * e.g. "16/9" → "1920 × 1080", "4/5" → "1080 × 1350", "1/1" → "1080 × 1080".
 */
export function aspectResolution(aspect: string): string {
  const [w, h] = aspect.split("/").map(Number);
  if (!w || !h) return "";
  if (w > h) return `${1920} × ${Math.round((1920 * h) / w)}`;
  return `${1080} × ${Math.round((1080 * h) / w)}`;
}

// ── Parsing helpers ───────────────────────────────────────────────────────────
function num(v: unknown, d: number): number {
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : d;
}

/** Coerce a stored value into a BrandImage (or null if it has no url). */
export function toBrandImage(v: unknown): BrandImage | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!o.url || typeof o.url !== "string") return null;
  return { url: o.url, cropX: num(o.cropX, 50), cropY: num(o.cropY, 50), zoom: num(o.zoom, 100) };
}

function toBrandImageList(v: unknown): BrandImage[] {
  return Array.isArray(v) ? (v.map(toBrandImage).filter(Boolean) as BrandImage[]) : [];
}

export function toHeroSlide(v: unknown, i: number): HeroSlide {
  const o = (v ?? {}) as Record<string, unknown>;
  return {
    id: typeof o.id === "string" ? o.id : `slide-${i}`,
    desktop: toBrandImage(o.desktop),
    mobile: toBrandImage(o.mobile),
    headline: typeof o.headline === "string" ? o.headline : "",
    subHeadline: typeof o.subHeadline === "string" ? o.subHeadline : "",
  };
}

export interface Branding {
  home: HomeBranding;
  about: AboutBranding;
  auth: AuthBranding;
}

/** Parse a raw `branding_assets` row-map into the typed Branding shape. */
export function parseBranding(bySection: Map<string, Record<string, unknown>>): Branding {
  const home = bySection.get(SECTION.home) ?? {};
  const about = bySection.get(SECTION.about) ?? {};
  const auth = bySection.get(SECTION.auth) ?? {};
  return {
    home: {
      heroSlides: Array.isArray(home.heroSlides) ? home.heroSlides.map(toHeroSlide) : [],
    },
    about: {
      hero: toBrandImage(about.hero),
      mobileSlides: toBrandImageList(about.mobileSlides),
      craftsmanship: toBrandImageList(about.craftsmanship),
      philosophy: toBrandImage(about.philosophy),
    },
    auth: {
      topLeft: toBrandImage(auth.topLeft),
      bottomRight: toBrandImage(auth.bottomRight),
    },
  };
}

export { toBrandImageList };

/**
 * Collect the image URLs stored for a branding section (shape-aware), for the
 * admin Branding card previews. Home → hero-slide images; About/Auth → each
 * slot's image(s). Returns them in display order.
 */
export function brandingPreviewUrls(sectionName: string, images: unknown): string[] {
  const schema = BRANDING_SCHEMA[sectionName];
  const imgs = (images ?? {}) as Record<string, unknown>;
  const urls: string[] = [];
  if (!schema) return urls;

  if (schema.kind === "home") {
    const slides = Array.isArray(imgs.heroSlides) ? imgs.heroSlides.map(toHeroSlide) : [];
    for (const s of slides) {
      const u = s.desktop?.url || s.mobile?.url;
      if (u) urls.push(u);
    }
    return urls;
  }

  for (const slot of schema.slots) {
    if (slot.kind === "single") {
      const bi = toBrandImage(imgs[slot.key]);
      if (bi?.url) urls.push(bi.url);
    } else {
      for (const bi of toBrandImageList(imgs[slot.key])) urls.push(bi.url);
    }
  }
  return urls;
}
