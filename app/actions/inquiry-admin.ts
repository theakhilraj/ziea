"use server";

// Admin write/read actions for the Design Inquiries section (Phase 4). This is a
// deliberate clone of app/actions/consultation-admin.ts: every mutating action
// FIRST verifies the caller is an Admin (getAdminClaims → role check); a non-admin
// gets { ok:false, error:"Unauthorized" } and no DB access. All reads/writes go
// through the SSR admin client (createClient), which carries the admin session so
// RLS permits the settings / status mutations.
//
// The customer inquiry page (/customisation/inquiry) reads getDeliveryWindow(),
// whose settings row is cached; the settings write revalidates that cache tag
// (and both pages) so a changed delivery window surfaces on the calendar promptly.

import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";

import { createClient } from "@/utils/supabase/server";
import { getAdminClaims } from "@/utils/admin/session";
import { INQUIRY_SETTINGS_TAG } from "@/utils/inquiry.server";
import type { AdminDesignInquiry, DesignInquiryStatus } from "@/utils/inquiry";

// Re-export the client-safe types so the admin page / client can import them from
// this action module (mirrors consultation-admin's AdminConsultation export).
export type {
  AdminDesignInquiry,
  DesignInquiryStatus,
  DesignInquirySettings,
} from "@/utils/inquiry";

// ── Shared result shape ──────────────────────────────────────────────────────

type ActionResult = { ok: true } | { ok: false; error: string };

const INQUIRY_ADMIN_PATH = "/admin/design-inquiries";
const INQUIRY_CUSTOMER_PATH = "/customisation/inquiry";
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

// ── Status ───────────────────────────────────────────────────────────────────

const INQUIRY_STATUSES = ["new", "reviewed", "closed"] as const;

const statusSchema = z.object({
  id: z.string().uuid("Invalid inquiry reference."),
  status: z.enum(INQUIRY_STATUSES),
});

/**
 * Move an inquiry through new / reviewed / closed. Best-effort activity_logs
 * entry; never fail the status change on a logging error. Revalidates the admin
 * page so the list / badge reflect the change.
 */
export async function updateInquiryStatus(
  id: string,
  status: (typeof INQUIRY_STATUSES)[number],
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: UNAUTHORIZED };

  const parsed = statusSchema.safeParse({ id, status });
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createClient();
  const { data: row, error } = await supabase
    .from("design_inquiries")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.id)
    .select("id, ref, name, mode")
    .maybeSingle<{ id: string; ref: string; name: string; mode: string }>();

  if (error) {
    console.error("[inquiry-admin] updateInquiryStatus failed", error);
    return { ok: false, error: "Couldn't update the inquiry. Please try again." };
  }
  if (!row) {
    return { ok: false, error: "That inquiry could not be found." };
  }

  try {
    await supabase.from("activity_logs").insert({
      type: "Design Inquiry Updated",
      description: `${row.name}'s design inquiry ${row.ref} was marked ${parsed.data.status}`,
      metadata: {
        ref: row.ref,
        status: parsed.data.status,
        mode: row.mode,
      },
    });
  } catch (logErr) {
    console.error("[inquiry-admin] activity_logs insert failed", logErr);
  }

  revalidatePath(INQUIRY_ADMIN_PATH);
  return { ok: true };
}

// ── Settings ─────────────────────────────────────────────────────────────────

const settingsSchema = z
  .object({
    deliveryLeadDays: z
      .number()
      .int("Lead time must be a whole number of days.")
      .min(0, "Lead time can't be negative.")
      .max(365, "Lead time can be at most 365 days."),
    maxAdvanceDays: z
      .number()
      .int("Advance window must be a whole number of days.")
      .min(1, "Customers must be able to pick at least 1 day ahead.")
      .max(730, "Advance window can be at most 730 days."),
  })
  .refine((d) => d.deliveryLeadDays < d.maxAdvanceDays, {
    message: "Earliest delivery must be before the latest date.",
    path: ["deliveryLeadDays"],
  });

export type UpdateInquirySettingsInput = z.input<typeof settingsSchema>;

/**
 * Update the single design_inquiry_settings row. Validates the lead/advance
 * window (incl. lead < max), then READS the one row's id and UPDATEs by id — NOT
 * upsert (which would default a new uuid PK and insert a second settings row).
 * Revalidates both the admin page and the customer inquiry page so the new window
 * appears on the customer calendar promptly.
 */
export async function updateInquirySettings(
  input: UpdateInquirySettingsInput,
): Promise<ActionResult> {
  if (!(await isAdmin())) return { ok: false, error: UNAUTHORIZED };

  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const data = parsed.data;

  const supabase = await createClient();

  // Locate the single settings row so the UPDATE carries a concrete filter.
  const { data: row, error: readError } = await supabase
    .from("design_inquiry_settings")
    .select("id")
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (readError || !row) {
    if (readError) console.error("[inquiry-admin] settings read failed", readError);
    return {
      ok: false,
      error: "Design inquiry settings haven't been initialised yet.",
    };
  }

  const { error } = await supabase
    .from("design_inquiry_settings")
    .update({
      delivery_lead_days: data.deliveryLeadDays,
      max_advance_days: data.maxAdvanceDays,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (error) {
    console.error("[inquiry-admin] settings update failed", error);
    return { ok: false, error: "Couldn't save your settings. Please try again." };
  }

  // Invalidate the cached settings read so the new window is picked up at once,
  // plus the two pages that render it.
  revalidateTag(INQUIRY_SETTINGS_TAG, "max");
  revalidatePath(INQUIRY_ADMIN_PATH);
  revalidatePath(INQUIRY_CUSTOMER_PATH);
  return { ok: true };
}

// ── Paginated read helper ─────────────────────────────────────────────────────

const PAGE_SIZE = 10;

export interface GetAdminInquiriesResult {
  rows: AdminDesignInquiry[];
  total: number;
  totalPages: number;
  page: number;
}

/**
 * A page (10/row) of design inquiries for the admin list, newest-first, optionally
 * filtered by status. Reads through the SSR admin client so RLS permits the SELECT.
 * Defense in depth: this is a "use server" endpoint (callable directly), so gate it
 * like the mutating actions even though RLS already blocks the SELECT for non-admins.
 */
export async function getAdminInquiries({
  page = 1,
  status,
}: {
  page?: number;
  status?: DesignInquiryStatus;
}): Promise<GetAdminInquiriesResult> {
  const safePage = Math.max(1, Math.floor(page) || 1);

  if (!(await isAdmin())) {
    return { rows: [], total: 0, totalPages: 1, page: safePage };
  }

  const from = (safePage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();
  let query = supabase
    .from("design_inquiries")
    .select(
      "id, ref, mode, name, email, phone, requirements, theme, bust_chest, size_unit, delivery_date, members, image_urls, image_note, status, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (status) query = query.eq("status", status);

  const { data, count } = await query;

  const total = count ?? 0;
  return {
    rows: (data ?? []) as AdminDesignInquiry[],
    total,
    totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    page: safePage,
  };
}
