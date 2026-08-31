"use server";

// Admin write actions for the Designer Consultation section (Phase 7 admin +
// Phase 8 wiring). Every mutating action FIRST verifies the caller is an Admin
// (getAdminClaims → role check); a non-admin gets { ok:false, error:"Unauthorized" }
// and no DB access. All reads/writes go through the SSR admin client (createClient
// from @/utils/supabase/server), which carries the admin session so RLS permits
// the settings / day-off / booking mutations.
//
// The customer availability page (/customisation/consultation) is Static/ISR
// (revalidate 1h) but reads getAvailableSlots FRESH — so settings + day-off
// changes must revalidatePath('/customisation/consultation') to surface on the
// customer calendar promptly. Booking-status changes need no revalidate
// (availability is uncached), but we add one harmlessly for consistency.

import { z } from "zod";
import { revalidatePath } from "next/cache";

import { createClient } from "@/utils/supabase/server";
import { getAdminClaims } from "@/utils/admin/session";
import { timeToMinutes, formatSlotDate, formatSlotTime } from "@/utils/consultation";

// ── Shared result shape ──────────────────────────────────────────────────────

type ActionResult = { ok: true } | { ok: false; error: string };

const CONSULTATION_PATH = "/customisation/consultation";
const UNAUTHORIZED = "Unauthorized" as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** True only if the current request is made by an authenticated Admin. */
async function isAdmin(): Promise<boolean> {
  const claims = await getAdminClaims();
  return claims?.role === "Admin";
}

/** First Zod issue message, or a generic fallback. */
function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid input.";
}

// Postgres unique-violation SQLSTATE (a day-off already exists for that date).
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────

const TIME_RE = /^\d{2}:\d{2}$/; // "HH:MM"
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/; // "YYYY-MM-DD"

const settingsSchema = z
  .object({
    workStart: z.string().regex(TIME_RE, "Start time must be in HH:MM format."),
    workEnd: z.string().regex(TIME_RE, "End time must be in HH:MM format."),
    slotMinutes: z
      .number()
      .int("Slot length must be a whole number of minutes.")
      .min(15, "Slot length must be at least 15 minutes.")
      .max(240, "Slot length can be at most 240 minutes."),
    leadTimeHours: z
      .number()
      .int("Lead time must be a whole number of hours.")
      .min(0, "Lead time can't be negative.")
      .max(168, "Lead time can be at most 168 hours."),
    maxAdvanceDays: z
      .number()
      .int("Advance window must be a whole number of days.")
      .min(1, "Customers must be able to book at least 1 day ahead.")
      .max(365, "Advance window can be at most 365 days."),
  })
  .refine((v) => timeToMinutes(v.workEnd) > timeToMinutes(v.workStart), {
    message: "End time must be after the start time.",
    path: ["workEnd"],
  })
  .refine(
    (v) => v.slotMinutes <= timeToMinutes(v.workEnd) - timeToMinutes(v.workStart),
    {
      message: "Slot length can't exceed the length of the working day.",
      path: ["slotMinutes"],
    },
  );

export type UpdateConsultationSettingsInput = z.input<typeof settingsSchema>;

/**
 * Update the single consultation_settings row. Validates the times/slot/window,
 * then patches the one row (matched by its own id — Supabase requires an explicit
 * filter on UPDATE). Revalidates the customer calendar so the new hours/window
 * appear promptly.
 */
export async function updateConsultationSettings(
  input: UpdateConsultationSettingsInput,
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: UNAUTHORIZED };

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const data = parsed.data;

  const supabase = await createClient();

  // Locate the single settings row so the UPDATE carries a concrete filter.
  const { data: row, error: readError } = await supabase
    .from("consultation_settings")
    .select("id")
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (readError) {
    console.error("[consultation-admin] settings read failed", readError);
    return { ok: false, error: "Couldn't load the current settings. Please try again." };
  }
  if (!row) {
    return { ok: false, error: "Consultation settings haven't been initialised yet." };
  }

  const { error } = await supabase
    .from("consultation_settings")
    .update({
      work_start: data.workStart,
      work_end: data.workEnd,
      slot_minutes: data.slotMinutes,
      lead_time_hours: data.leadTimeHours,
      max_advance_days: data.maxAdvanceDays,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (error) {
    console.error("[consultation-admin] settings update failed", error);
    return { ok: false, error: "Couldn't save your settings. Please try again." };
  }

  revalidatePath(CONSULTATION_PATH);
  return { ok: true };
}

// ── Days off ─────────────────────────────────────────────────────────────────

const dayOffSchema = z.object({
  dayISO: z.string().regex(DATE_RE, "Please pick a valid date."),
  reason: z.string().trim().max(200, "Reason is too long.").optional(),
});

/**
 * Add a blackout date. Inserts into consultation_days_off; a duplicate (unique on
 * `day`) surfaces as a 23505 and is treated as an idempotent success — the date is
 * already off, which is the desired end state. Revalidates the customer calendar.
 */
export async function addDayOff(dayISO: string, reason?: string): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: UNAUTHORIZED };

  const parsed = dayOffSchema.safeParse({ dayISO, reason });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const reasonValue =
    parsed.data.reason && parsed.data.reason !== "" ? parsed.data.reason : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("consultation_days_off")
    .insert({ day: parsed.data.dayISO, reason: reasonValue });

  if (error) {
    // Already blacked out → nothing to do, report success.
    if (isUniqueViolation(error)) {
      revalidatePath(CONSULTATION_PATH);
      return { ok: true };
    }
    console.error("[consultation-admin] addDayOff failed", error);
    return { ok: false, error: "Couldn't add that day off. Please try again." };
  }

  revalidatePath(CONSULTATION_PATH);
  return { ok: true };
}

/**
 * Remove a blackout date (restore availability for it). Deleting a date that
 * isn't off is a no-op and still reports success. Revalidates the customer
 * calendar.
 */
export async function removeDayOff(dayISO: string): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: UNAUTHORIZED };

  const parsed = z.string().regex(DATE_RE, "Please pick a valid date.").safeParse(dayISO);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("consultation_days_off")
    .delete()
    .eq("day", parsed.data);

  if (error) {
    console.error("[consultation-admin] removeDayOff failed", error);
    return { ok: false, error: "Couldn't remove that day off. Please try again." };
  }

  revalidatePath(CONSULTATION_PATH);
  return { ok: true };
}

// ── Booking status ───────────────────────────────────────────────────────────

const CONSULTATION_STATUSES = ["confirmed", "completed", "cancelled"] as const;
export type ConsultationStatus = (typeof CONSULTATION_STATUSES)[number];

const statusSchema = z.object({
  id: z.string().uuid("Invalid booking reference."),
  status: z.enum(CONSULTATION_STATUSES),
});

const STATUS_LOG_LABELS: Record<ConsultationStatus, string> = {
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

/**
 * Move a booking through confirmed / completed / cancelled. Cancelling frees the
 * slot automatically: availability excludes status <> 'confirmed' bookings and the
 * partial unique index ignores 'cancelled', so the time reopens. Availability is
 * uncached (no revalidate strictly needed) but we revalidate the customer calendar
 * harmlessly for consistency. Best-effort activity_logs entry.
 */
export async function updateConsultationStatus(
  id: string,
  status: ConsultationStatus,
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: UNAUTHORIZED };

  const parsed = statusSchema.safeParse({ id, status });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("consultations")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .select("id, ref, name, slot_date, slot_time")
    .maybeSingle<{
      id: string;
      ref: string;
      name: string;
      slot_date: string;
      slot_time: string;
    }>();

  if (error) {
    console.error("[consultation-admin] updateConsultationStatus failed", error);
    return { ok: false, error: "Couldn't update the booking. Please try again." };
  }
  if (!updated) {
    return { ok: false, error: "That booking could not be found." };
  }

  // Best-effort activity log — mirrors the booking action's { type, description,
  // metadata } shape. Never fail the status change on a logging error.
  try {
    await supabase.from("activity_logs").insert({
      type: "Consultation Updated",
      description: `${updated.name}'s consultation on ${formatSlotDate(updated.slot_date)} at ${formatSlotTime(updated.slot_time)} was marked ${STATUS_LOG_LABELS[parsed.data.status]}`,
      metadata: {
        ref: updated.ref,
        status: parsed.data.status,
        slot_date: updated.slot_date,
        slot_time: updated.slot_time,
      },
    });
  } catch (logErr) {
    console.error("[consultation-admin] activity_logs insert failed", logErr);
  }

  revalidatePath(CONSULTATION_PATH);
  return { ok: true };
}

// ── Paginated read helper (optional, for the admin list page) ─────────────────

const PAGE_SIZE = 20;

/** A booking row as surfaced to the admin list UI. */
export interface AdminConsultation {
  id: string;
  ref: string;
  name: string;
  email: string;
  phone: string;
  method: "google_meet" | "whatsapp_video";
  slot_date: string;
  slot_time: string;
  slot_minutes: number;
  notes: string | null;
  image_url: string | null;
  image_note: string | null;
  status: ConsultationStatus;
  created_at: string;
}

export interface GetAdminConsultationsResult {
  rows: AdminConsultation[];
  total: number;
  totalPages: number;
  page: number;
}

/**
 * A page (20/row) of bookings for the admin list, newest-first, optionally
 * filtered by status. Reads through the SSR admin client so RLS permits the SELECT.
 * The server page may use this or read inline — both go through the same client.
 */
export async function getAdminConsultations({
  page = 1,
  status,
}: {
  page?: number;
  status?: ConsultationStatus;
}): Promise<GetAdminConsultationsResult> {
  const safePage = Math.max(1, Math.floor(page) || 1);

  // Defense in depth: this is a "use server" endpoint (callable directly), so
  // gate it like the mutating actions even though RLS already blocks the SELECT
  // for non-admins. Return an empty page rather than leaking anything.
  if (!(await isAdmin())) {
    return { rows: [], total: 0, totalPages: 1, page: safePage };
  }

  const from = (safePage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  let query = supabase
    .from("consultations")
    .select(
      "id, ref, name, email, phone, method, slot_date, slot_time, slot_minutes, notes, image_url, image_note, status, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("status", status);

  const { data, count } = await query;

  const total = count ?? 0;
  return {
    rows: (data ?? []) as AdminConsultation[],
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    page: safePage,
  };
}
