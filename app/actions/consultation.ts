"use server";

// Designer Consultation booking action (Phase 4 — the write side of the spine).
//
// Instant-book, free consultation: a confirmed row IS the block. Guests may book,
// so the INSERT runs under the SSR/anon client (public INSERT is allowed by RLS;
// SELECT is admin-only, so we NEVER read the row back — we rely on the values we
// sent). Availability (settings / day-offs / lead-time / interval-overlap) lives
// in utils/consultation.ts and is re-checked here right before the insert.
//
// Next 16: request APIs are async — `await headers()`.
import { z } from "zod";
import { Resend } from "resend";
import { headers } from "next/headers";

import { createClient } from "@/utils/supabase/server";
import {
  getAvailableSlots,
  isSlotAvailable,
  formatSlotDate,
  formatSlotTime,
} from "@/utils/consultation";

// ── Validation ───────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/; // "YYYY-MM-DD"
const TIME_RE = /^\d{2}:\d{2}$/; // "HH:MM"
// Indian mobile once spaces/hyphens are stripped: optional +91 / 91 / 0, then a
// leading 6–9 and 9 more digits.
const IN_MOBILE_RE = /^(?:\+?91|0)?[6-9]\d{9}$/;

const bookingSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name.").max(80, "Name is too long."),
  email: z.string().trim().email("Please enter a valid email address."),
  phone: z
    .string()
    .trim()
    .refine(
      (v) => IN_MOBILE_RE.test(v.replace(/[\s-]/g, "")),
      "Please enter a valid Indian mobile number.",
    ),
  method: z.enum(["google_meet", "whatsapp_video"]),
  slotDate: z.string().regex(DATE_RE, "Please pick a valid date."),
  slotTime: z.string().regex(TIME_RE, "Please pick a valid time."),
  notes: z.string().trim().max(2000, "Notes are too long.").optional(),
  // Accept our upload endpoint's output: a relative CDN path ("/cdn/...", the
  // dev/default) OR an absolute http(s) URL (prod with NEXT_PUBLIC_ASSET_BASE_URL).
  // Rejects junk / injection schemes (javascript:, data:, etc.).
  imageUrl: z
    .string()
    .trim()
    .max(2048)
    .refine(
      // Relative CDN path ("/cdn/..."), but NOT protocol-relative ("//evil.com",
      // which would resolve to an arbitrary external origin), OR an absolute
      // http(s) URL. Rejects junk / injection schemes (javascript:, data:, etc.).
      (v) =>
        v === "" ||
        (v.startsWith("/") && !v.startsWith("//")) ||
        /^https?:\/\//i.test(v),
      "Invalid image link.",
    )
    .optional(),
  imageNote: z.string().trim().max(500, "Image note is too long.").optional(),
  agreedTerms: z.literal(true),
  submissionToken: z.string().uuid("Invalid submission."),
  // Honeypot — real users never fill this. Must be empty; if present we silently
  // no-op with a fake success (starve bots of signal).
  website: z.string().optional().default(""),
});

export type CustomisationSubmitInput = z.input<typeof bookingSchema>;
export type CustomisationSubmitResult =
  | { ok: true; ref: string }
  | { ok: false; error: string };

const SLOT_TAKEN = "That time was just taken - please pick another." as const;

// ── Available-slots wrapper (customer form calls this on date select) ─────────

/**
 * Fresh available "HH:MM" slot list for a date. Thin wrapper over
 * getAvailableSlots with a shape guard so a malformed date can't reach the query.
 */
export async function getAvailableSlotsAction(dateISO: string): Promise<string[]> {
  if (typeof dateISO !== "string" || !DATE_RE.test(dateISO)) return [];
  return getAvailableSlots(dateISO);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const METHOD_LABELS: Record<CustomisationSubmitInput["method"], string> = {
  google_meet: "Google Meet",
  whatsapp_video: "WhatsApp Video",
};


// Unambiguous code alphabet — no 0/O, 1/I/L (easy to read out over phone/WhatsApp).
const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * Human-friendly, deterministic booking reference: "ZC-<MMDD>-<CODE>".
 *  - <MMDD> = the appointment date's month+day, taken from `slotDate` (the payload,
 *    NOT the DB) so it stays deterministic.
 *  - <CODE> = 5 chars from REF_ALPHABET, derived PURELY from the submission_token.
 * Because it depends only on (slotDate, submission_token), a retried submit — which
 * collides on the submission_token unique index — resolves to the SAME ref without
 * reading the row back (guest RLS forbids SELECT). No wall-clock: identical inputs
 * ⇒ identical ref, always. e.g. "ZC-0901-8F4KM".
 */
function refFromToken(submissionToken: string, slotDate: string): string {
  const mmdd = slotDate.replace(/-/g, "").slice(4, 8); // "2026-09-01" → "0901"
  const hex = submissionToken.replace(/-/g, "");
  let code = "";
  for (let i = 0; i < 5; i += 1) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2) || "0", 16);
    code += REF_ALPHABET[byte % REF_ALPHABET.length];
  }
  return `ZC-${mmdd}-${code}`;
}

/** Best-effort client IP from proxy headers (x-forwarded-for first, then x-real-ip). */
function clientIp(fwd: string | null, real: string | null): string | null {
  const first = fwd?.split(",")[0]?.trim();
  if (first) return first;
  return real?.trim() || null;
}

// Postgres unique-violation SQLSTATE.
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

// ── Booking submission ───────────────────────────────────────────────────────

export async function submitConsultation(
  input: CustomisationSubmitInput,
): Promise<CustomisationSubmitResult> {
  // 1) Validate + honeypot.
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid details." };
  }
  const data = parsed.data;

  if (data.website.trim() !== "") {
    // Bot: pretend it worked, write nothing.
    return { ok: true, ref: refFromToken(data.submissionToken, data.slotDate) };
  }

  const {
    name,
    email,
    phone,
    method,
    slotDate,
    slotTime,
    notes,
    imageUrl,
    imageNote,
    submissionToken,
  } = data;

  const phoneNormalised = phone.replace(/[\s-]/g, "");
  const imageUrlValue = imageUrl && imageUrl !== "" ? imageUrl : null;
  const notesValue = notes && notes !== "" ? notes : null;
  const imageNoteValue = imageNote && imageNote !== "" ? imageNote : null;

  // 2) Re-check the slot is still free (fresh settings/day-offs/lead/overlap).
  const stillFree = await isSlotAvailable(slotDate, slotTime);
  if (!stillFree) {
    return { ok: false, error: SLOT_TAKEN };
  }

  const supabase = await createClient();

  // 3) Snapshot slot_minutes from the current settings row onto this booking, so
  //    a later admin change to slot length never mutates an existing booking.
  const { data: settings } = await supabase
    .from("consultation_settings")
    .select("slot_minutes")
    .limit(1)
    .maybeSingle<{ slot_minutes: number }>();

  if (!settings) {
    return { ok: false, error: "Booking is unavailable right now. Please try again later." };
  }
  const slotMinutes = settings.slot_minutes;

  // 4) Server-stamp consent context + the deterministic ref.
  const h = await headers();
  const consentIp = clientIp(h.get("x-forwarded-for"), h.get("x-real-ip"));
  const consentUa = h.get("user-agent");
  const ref = refFromToken(submissionToken, slotDate);

  // 5) INSERT the confirmed booking. Two unique indexes can fire a 23505:
  //    - submission_token → an idempotent retry of THIS booking → treat as success.
  //    - (slot_date, slot_time) partial → a genuine same-slot race → "just taken".
  //    Under anon RLS we can't read the row back, so we don't .select().
  const { error } = await supabase.from("consultations").insert({
    ref,
    name,
    email,
    phone: phoneNormalised,
    method,
    slot_date: slotDate,
    slot_time: slotTime,
    slot_minutes: slotMinutes,
    notes: notesValue,
    image_url: imageUrlValue,
    image_note: imageNoteValue,
    agreed_terms: true,
    consent_ip: consentIp,
    consent_ua: consentUa,
    status: "confirmed",
    submission_token: submissionToken,
  });

  if (error) {
    if (isUniqueViolation(error)) {
      // Three unique constraints can raise 23505; disambiguate by name (we can't
      // read the row back under guest RLS):
      //  - submission_token → an idempotent retry of THIS booking → success.
      //  - slot_unique      → a genuine same-slot race → "just taken".
      //  - ref (consultations_ref_key) → an astronomically-rare deterministic-ref
      //    collision between two DIFFERENT bookings; NOT the slot being taken, so
      //    don't mislabel it (that would falsely block a free slot forever). Log
      //    it and ask the user to retry.
      if (error.message?.includes("consultations_submission_token_idx")) {
        return { ok: true, ref };
      }
      if (error.message?.includes("consultations_slot_unique_idx")) {
        return { ok: false, error: SLOT_TAKEN };
      }
      console.error("[consultation] unexpected unique violation", error);
      return { ok: false, error: "Couldn't complete your booking. Please try again." };
    }
    console.error("[consultation] insert failed", error);
    return { ok: false, error: "Couldn't complete your booking. Please try again." };
  }

  // 6) Activity log (mirrors ContactForm's { type, description, metadata }).
  try {
    await supabase.from("activity_logs").insert({
      type: "Consultation Booked",
      description: `${name} booked a consultation for ${formatSlotDate(slotDate)} at ${formatSlotTime(slotTime)} (${METHOD_LABELS[method]})`,
      metadata: {
        ref,
        email,
        phone: phoneNormalised,
        method,
        slot_date: slotDate,
        slot_time: slotTime,
        slot_minutes: slotMinutes,
      },
    });
  } catch (logErr) {
    console.error("[consultation] activity_logs insert failed", logErr);
  }

  // 7) Admin-only notification email (fire-and-forget; NEVER fail the booking).
  await sendAdminEmail({
    ref,
    name,
    email,
    phone: phoneNormalised,
    method,
    slotDate,
    slotTime,
    notes: notesValue,
    imageUrl: imageUrlValue,
    imageNote: imageNoteValue,
  }).catch((emailErr) => {
    console.error("[consultation] admin email failed", emailErr);
  });

  // 8) Done.
  return { ok: true, ref };
}

// ── Admin email ──────────────────────────────────────────────────────────────

interface AdminEmailPayload {
  ref: string;
  name: string;
  email: string;
  phone: string;
  method: CustomisationSubmitInput["method"];
  slotDate: string;
  slotTime: string;
  notes: string | null;
  imageUrl: string | null;
  imageNote: string | null;
}

async function sendAdminEmail(p: AdminEmailPayload): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.PROTOFORM_ENQUIRY_TO;
  const from =
    process.env.PROTOFORM_ENQUIRY_FROM ?? "ZIEA Consultations <onboarding@resend.dev>";

  if (!apiKey || !to) {
    console.error("[consultation] RESEND_API_KEY or PROTOFORM_ENQUIRY_TO is not set");
    return;
  }

  const rows: Array<[string, string]> = [
    ["Reference", p.ref],
    ["Name", p.name],
    ["Email", p.email],
    ["Phone", p.phone],
    ["Method", METHOD_LABELS[p.method]],
    ["Date", formatSlotDate(p.slotDate)],
    ["Time", formatSlotTime(p.slotTime)],
    ["Notes", p.notes || "—"],
    ["Image note", p.imageNote || "—"],
  ];

  const imageRow = p.imageUrl
    ? `
      <tr>
        <td style="padding:12px 16px;border-top:1px solid #eee;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#7A7068;width:120px;vertical-align:top">Reference image</td>
        <td style="padding:12px 16px;border-top:1px solid #eee;font-size:14px;color:#2C3829"><a href="${escapeHtml(
      p.imageUrl,
    )}" style="color:#2C3829">View image</a></td>
      </tr>`
    : "";

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#2C3829">
      <div style="background:#2C3829;color:#F5F0E8;padding:20px 24px;border-radius:12px 12px 0 0">
        <h2 style="margin:0;font-size:18px">New consultation booking — ZIEA</h2>
        <p style="margin:6px 0 0;font-size:13px;color:#c8d1c0">Instant-booked from the storefront. Share the meeting link manually.</p>
      </div>
      <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e2dccf;border-top:none;border-radius:0 0 12px 12px">
        ${rows
      .map(
        ([k, v]) => `
          <tr>
            <td style="padding:12px 16px;border-top:1px solid #eee;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#7A7068;width:120px;vertical-align:top">${k}</td>
            <td style="padding:12px 16px;border-top:1px solid #eee;font-size:14px;color:#2C3829;white-space:pre-wrap">${escapeHtml(
          v,
        )}</td>
          </tr>`,
      )
      .join("")}
        ${imageRow}
      </table>
    </div>`;

  const text = [
    ...rows.map(([k, v]) => `${k}: ${v}`),
    p.imageUrl ? `Reference image: ${p.imageUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from,
    to: [to],
    replyTo: p.email,
    subject: `New consultation — ${p.name} on ${formatSlotDate(p.slotDate)} ${formatSlotTime(p.slotTime)}`,
    html,
    text,
  });
  if (error) {
    console.error("[consultation] resend error", error);
  }
}
