// Client-safe Design Inquiry types, the frozen constants, and pure date helpers.
// This module has NO next/headers, NO next/cache and NO server-only import, so —
// exactly like utils/consultation.ts — it is importable from anywhere (client
// components, server actions, route handlers). The delivery-window server read
// (which caches the rarely-changing settings) lives in utils/inquiry.server.ts.

// Re-export the shared client-safe helpers rather than duplicating them, so the
// inquiry form (Phase 3) can import everything it needs from one module.
export { uuidV4, formatSlotDate } from "@/utils/consultation";

// ── Frozen constants (must agree across SQL CHECK / Zod / rate limiter) ───────

/** Group moodboard image cap. Individual mode allows exactly 1 image. */
export const MOODBOARD_MAX = 10;

/** Group member cap (min 2 enforced in Zod / DB CHECK). */
export const MEMBERS_MAX = 20;

/**
 * Garment options for a group member's "Looking for". A readonly tuple so it can
 * be handed straight to `z.enum(GARMENT_TYPES)` in the action.
 */
export const GARMENT_TYPES = [
  "Lehenga",
  "Saree / Blouse",
  "Anarkali",
  "Gown / Evening wear",
  "Kurti / Kurta set",
  "Bridal",
  "Bridesmaid",
  "Suiting",
  "Other",
] as const;

// ── Types ────────────────────────────────────────────────────────────────────

/** Whether the inquiry is for a single person or a group of members. */
export type InquiryMode = "individual" | "group";

/** A single group member, snapshotted into the parent row's `members` jsonb. */
export interface InquiryMember {
  name: string;
  garment: string;
  bustChest: number;
}

/** Triage status of an inquiry. */
export type DesignInquiryStatus = "new" | "reviewed" | "closed";

/** The admin-editable delivery-window config (single row in design_inquiry_settings). */
export interface DesignInquirySettings {
  id: string;
  delivery_lead_days: number;
  max_advance_days: number;
  updated_at: string | null;
}

/** A full `design_inquiries` row as read by the admin section. */
export interface AdminDesignInquiry {
  id: string;
  ref: string;
  mode: InquiryMode;
  name: string;
  email: string;
  phone: string;
  garment: string | null;
  requirements: string | null;
  theme: string | null;
  bust_chest: string | null;
  size_unit: string | null;
  delivery_date: string;
  members: InquiryMember[];
  image_urls: string[];
  image_note: string | null;
  status: DesignInquiryStatus;
  created_at: string;
}

// ── Date helper (IST-safe, no local-TZ dependence) ───────────────────────────

/**
 * Add `days` whole days to a "YYYY-MM-DD" string, TZ-safe (UTC math). Copied
 * locally because it is module-private in utils/consultation.ts (same precedent
 * as app/admin/consultations/page.tsx:22-30).
 */
export function addDaysISO(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
