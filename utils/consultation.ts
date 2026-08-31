// Client-safe consultation types + pure availability helpers, plus one FRESH
// server read that uses the cookie-less public Supabase client. This module has
// NO next/headers and NO server-only imports, so it is importable from anywhere
// (client components, server actions, route handlers).
//
// Timezone is Asia/Kolkata (IST, fixed UTC+5:30, no DST). All "now"/today logic
// is computed in IST via Intl — never the server's local timezone.
import { createPublicClient } from "@/utils/supabase/public";

// ── Types ────────────────────────────────────────────────────────────────────

/** The admin-editable booking config (single row in consultation_settings). */
export interface ConsultationSettings {
  id: string;
  work_start: string; // "HH:MM" or "HH:MM:SS" as returned by Postgres TIME
  work_end: string; // "HH:MM" or "HH:MM:SS"
  slot_minutes: number;
  timezone: string;
  lead_time_hours: number;
  max_advance_days: number;
  updated_at: string | null;
}

/** A blackout date (holiday / leave) — zero availability. */
export interface DayOff {
  id: string;
  day: string; // "YYYY-MM-DD"
  reason: string | null;
  created_at: string | null;
}

/** A slot start time, always as a zero-padded "HH:MM" string. */
export type Slot = string;

/** An occupied interval on a given day: a start time + its duration snapshot. */
export interface BookingInterval {
  slot_time: string; // "HH:MM" / "HH:MM:SS"
  slot_minutes: number;
}

// ── Client-safe UUID ─────────────────────────────────────────────────────────

/**
 * A RFC-4122 v4 UUID that works in ANY browser context. `crypto.randomUUID` is
 * only defined in a secure context (https / localhost), so it throws when the app
 * is opened over a plain-http LAN IP (e.g. http://192.168.x.x:3000 during device
 * testing). This helper prefers `crypto.randomUUID`, falls back to
 * `crypto.getRandomValues` (available in non-secure contexts too), and finally to
 * `Math.random`, always emitting a value that passes `z.string().uuid()`.
 */
export function uuidV4(): string {
  const c: Crypto | undefined =
    typeof crypto !== "undefined" ? crypto : undefined;

  if (c?.randomUUID) return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }

  // Set version (4) and variant (10xx) bits per RFC 4122.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

// ── Pure time helpers ────────────────────────────────────────────────────────

/**
 * Minutes-since-midnight for a time string. Accepts "HH:MM" or "HH:MM:SS"
 * (Postgres TIME serialises with seconds), so it is safe on raw DB values.
 */
export function timeToMinutes(t: string): number {
  const [h = "0", m = "0"] = t.split(":");
  return Number(h) * 60 + Number(m);
}

/** Zero-padded "HH:MM" for a minutes-since-midnight value. */
export function minutesToTime(m: number): Slot {
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** "2026-09-01" → "1 Sep 2026" (day, abbreviated month, year). */
export function formatSlotDate(iso: string): string {
  const [y = "0", m = "1", d = "1"] = iso.slice(0, 10).split("-");
  const month = MONTH_ABBR[Number(m) - 1] ?? m;
  return `${Number(d)} ${month} ${y}`;
}

/** "HH:MM(:SS)" 24h → "h:MM AM/PM" (e.g. "09:00:00" → "9:00 AM"). */
export function formatSlotTime(t: string): string {
  const [hStr = "0", mStr = "0"] = t.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/**
 * All slot start times for a settings config: start at work_start, step by
 * slot_minutes, and stop so a slot never runs past work_end (LAST start =
 * work_end - slot_minutes). Returns "HH:MM" strings.
 */
export function generateSlots(settings: ConsultationSettings): Slot[] {
  const start = timeToMinutes(settings.work_start);
  const end = timeToMinutes(settings.work_end);
  const step = settings.slot_minutes;
  const slots: Slot[] = [];
  if (step <= 0) return slots;
  for (let m = start; m + step <= end; m += step) {
    slots.push(minutesToTime(m));
  }
  return slots;
}

/**
 * The current date (YYYY-MM-DD) and minutes-since-midnight, in Asia/Kolkata.
 * Uses Intl with a fixed timeZone so it is independent of the server's local TZ.
 */
export function istNowParts(): { dateISO: string; minutes: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";

  const year = get("year");
  const month = get("month");
  const day = get("day");
  // Intl can emit "24" for midnight under hour12:false; normalise to 0.
  const hour = get("hour") === "24" ? 0 : Number(get("hour"));
  const minute = Number(get("minute"));

  return { dateISO: `${year}-${month}-${day}`, minutes: hour * 60 + minute };
}

/**
 * True if two intervals (each start + duration, in minutes-since-midnight)
 * overlap. Touching edges (end == start) do NOT overlap.
 */
export function overlaps(
  candidateStart: number,
  candidateMinutes: number,
  bookingStart: number,
  bookingMinutes: number,
): boolean {
  const candidateEnd = candidateStart + candidateMinutes;
  const bookingEnd = bookingStart + bookingMinutes;
  return candidateStart < bookingEnd && bookingStart < candidateEnd;
}

// ── Date helpers (IST-safe, no local-TZ dependence) ──────────────────────────

/** Whole days from `fromISO` to `toISO` (both "YYYY-MM-DD"), toISO - fromISO. */
function dayDiff(fromISO: string, toISO: string): number {
  const from = Date.parse(`${fromISO}T00:00:00Z`);
  const to = Date.parse(`${toISO}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

// ── Server read (FRESH — never cached; availability must be live) ────────────

/**
 * The available slot start times ("HH:MM", sorted) for a date, computed against
 * live bookings. Reads FRESH via the cookie-less public client — deliberately NOT
 * wrapped in unstable_cache/use cache, because availability must reflect bookings
 * the instant they are made.
 *
 * Returns [] when: no settings row, the date is a day-off, in the past, or beyond
 * max_advance_days (all evaluated in IST). Excludes any generated slot that
 * overlaps a non-cancelled booking. For IST-today, also drops slots whose start
 * is before (now + lead_time_hours) so there is always enough lead time.
 */
export async function getAvailableSlots(dateISO: string): Promise<Slot[]> {
  const supabase = createPublicClient();
  const { dateISO: todayISO, minutes: nowMinutes } = istNowParts();

  // Fetch settings, the day-off check, and the day's bookings in PARALLEL — one
  // network round-trip instead of three back-to-back ones. (This is the fix for
  // the noticeable lag after picking a date.) The day-off/bookings queries are
  // tiny and date-scoped, so running them even for a day that turns out to be a
  // day-off costs nothing meaningful and saves two serial round-trips.
  const [settingsRes, dayOffRes, bookingsRes] = await Promise.all([
    supabase
      .from("consultation_settings")
      .select(
        "id, work_start, work_end, slot_minutes, timezone, lead_time_hours, max_advance_days, updated_at",
      )
      .limit(1)
      .maybeSingle<ConsultationSettings>(),
    supabase
      .from("consultation_days_off")
      .select("day")
      .eq("day", dateISO)
      .maybeSingle(),
    // consultations SELECT is admin-only (RLS protects PII), so the anon client
    // reads busy times via a SECURITY DEFINER RPC returning ONLY slot_time +
    // slot_minutes (no PII). Without this, booked slots wrongly stay available.
    supabase.rpc("consultation_busy_slots", { target_date: dateISO }),
  ]);

  const settings = settingsRes.data;
  if (!settings) return [];

  // Past date or beyond the booking window → no availability.
  const offset = dayDiff(todayISO, dateISO);
  if (offset < 0 || offset > settings.max_advance_days) return [];

  // Blackout date → no availability.
  if (dayOffRes.data) return [];

  const slots = generateSlots(settings);
  if (slots.length === 0) return [];

  // Active bookings for the day (interval-overlap exclusion, mixed durations OK).
  const intervals: BookingInterval[] = (bookingsRes.data ?? []) as BookingInterval[];
  const step = settings.slot_minutes;
  const earliest =
    offset === 0 ? nowMinutes + settings.lead_time_hours * 60 : Number.NEGATIVE_INFINITY;

  const available = slots.filter((slot) => {
    const start = timeToMinutes(slot);
    if (start < earliest) return false;
    for (const b of intervals) {
      if (overlaps(start, step, timeToMinutes(b.slot_time), b.slot_minutes)) return false;
    }
    return true;
  });

  return available.sort((a, b) => timeToMinutes(a) - timeToMinutes(b));
}

/**
 * Whether a specific slot start ("HH:MM") is still bookable for a date. Used by
 * the booking action to re-check availability just before insert.
 */
export async function isSlotAvailable(dateISO: string, time: Slot): Promise<boolean> {
  const slots = await getAvailableSlots(dateISO);
  const target = timeToMinutes(time);
  return slots.some((s) => timeToMinutes(s) === target);
}

/** Add `days` whole days to a "YYYY-MM-DD" string, TZ-safe (UTC math). */
function addDaysISO(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * The bookable calendar window for the customer page, computed FRESH (cookie-less
 * public client, no next/headers — safe to import anywhere):
 *  - todayISO: IST today ("YYYY-MM-DD").
 *  - maxISO:   todayISO + settings.max_advance_days (falls back to +30 if no
 *              settings row exists), computed with TZ-safe string math.
 *  - daysOff:  every consultation_days_off row within [today, max], as
 *              "YYYY-MM-DD" strings, so the Calendar can render them disabled.
 */
export async function getBookingWindow(): Promise<{
  todayISO: string;
  maxISO: string;
  daysOff: string[];
}> {
  const supabase = createPublicClient();
  const { dateISO: todayISO } = istNowParts();

  const { data: settings } = await supabase
    .from("consultation_settings")
    .select("max_advance_days")
    .limit(1)
    .maybeSingle<{ max_advance_days: number }>();

  const advance = settings?.max_advance_days ?? 30;
  const maxISO = addDaysISO(todayISO, advance);

  const { data: offRows } = await supabase
    .from("consultation_days_off")
    .select("day")
    .gte("day", todayISO)
    .lte("day", maxISO);

  const daysOff = (offRows ?? [])
    .map((r) => (r as { day: string }).day)
    // Normalise any timestamp-y value to the bare "YYYY-MM-DD".
    .map((d) => d.slice(0, 10));

  return { todayISO, maxISO, daysOff };
}
