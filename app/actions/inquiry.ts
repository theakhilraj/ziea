"use server";

// Design Inquiry submission action (Phase 2 — the write side of the spine).
//
// A clone of the Designer Consultation action, rebuilt around a discriminated
// union (individual | group). Guests may submit, so the INSERT runs under the
// SSR/anon client (public INSERT is allowed by RLS; SELECT is admin-only, so we
// NEVER read the row back — we rely on the values we sent). The delivery window
// lives in utils/inquiry.ts and is re-checked here right before the insert.
//
// Next 16: request APIs are async — `await headers()`.
import { z } from "zod";
import { headers } from "next/headers";

import { createClient } from "@/utils/supabase/server";
import { getDeliveryWindow } from "@/utils/inquiry.server";
import { MEMBERS_MAX, MOODBOARD_MAX } from "@/utils/inquiry";

// ── Validation ───────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/; // "YYYY-MM-DD"
// Indian mobile once spaces/hyphens are stripped: optional +91 / 91 / 0, then a
// leading 6–9 and 9 more digits.
const IN_MOBILE_RE = /^(?:\+?91|0)?[6-9]\d{9}$/;

// Accept our upload endpoint's output: a relative CDN path ("/cdn/...", the
// dev/default) OR an absolute http(s) URL. Rejects protocol-relative
// ("//evil.com") and junk / injection schemes (javascript:, data:, etc.).
// Applied PER array element.
const imageUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine(
    (v) => (v.startsWith("/") && !v.startsWith("//")) || /^https?:\/\//i.test(v),
    "Invalid image link.",
  );

// A garment ("looking for") value — a preset label OR the free-text a customer
// typed after choosing "Other" (the client resolves "Other" to that text before
// submit), so this is a bounded string rather than a fixed enum.
const garmentSchema = z
  .string()
  .trim()
  .min(1, "Please choose what you're looking for.")
  .max(80, "That's too long.");

const memberSchema = z.object({
  name: z.string().trim().min(1, "Member name is required.").max(80, "Name is too long."),
  garment: garmentSchema,
  bustChest: z.number().int().min(1).max(200),
});

// Shared spine — the contact + delivery + consent fields common to both modes.
const spine = {
  name: z.string().trim().min(2, "Please enter your name.").max(80, "Name is too long."),
  email: z.string().trim().email("Please enter a valid email address."),
  phone: z
    .string()
    .trim()
    .refine(
      (v) => IN_MOBILE_RE.test(v.replace(/[\s-]/g, "")),
      "Please enter a valid Indian mobile number.",
    ),
  deliveryDate: z.string().regex(DATE_RE, "Please pick a valid date."),
  agreedTerms: z.literal(true),
  submissionToken: z.string().uuid("Invalid submission."),
  // Honeypot — real users never fill this. Must be empty; if present we silently
  // no-op with a fake success (starve bots of signal).
  website: z.string().optional().default(""),
};

const individualSchema = z
  .object({
    ...spine,
    mode: z.literal("individual"),
    garment: garmentSchema,
    requirements: z
      .string()
      .trim()
      .min(1, "Please describe your requirements.")
      .max(2000, "Requirements are too long."),
    bust_chest: z
      .string()
      .trim()
      .regex(/^\d{1,3}$/, "Enter a valid measurement.")
      .refine((v) => Number(v) >= 1 && Number(v) <= 200, "Enter a measurement between 1 and 200.")
      .optional(),
    size_unit: z.enum(["cm", "inches"]).optional(),
    imageUrls: z.array(imageUrlSchema).max(1),
  })
  .refine(
    // Sizing is all-or-nothing: bust_chest and size_unit are both present or both absent.
    (d) => (d.bust_chest === undefined) === (d.size_unit === undefined),
    { message: "Please provide both a measurement and a unit.", path: ["bust_chest"] },
  );

const groupSchema = z.object({
  ...spine,
  mode: z.literal("group"),
  theme: z
    .string()
    .trim()
    .min(1, "Please describe your theme.")
    .max(2000, "Theme is too long."),
  size_unit: z.enum(["cm", "inches"]),
  members: z.array(memberSchema).min(2, "Add at least 2 members.").max(MEMBERS_MAX),
  imageUrls: z.array(imageUrlSchema).min(1, "Add at least one image.").max(MOODBOARD_MAX),
});

const inquirySchema = z.discriminatedUnion("mode", [individualSchema, groupSchema]);

export type SubmitInquiryInput = z.input<typeof inquirySchema>;
export type SubmitInquiryResult =
  | { ok: true; ref: string }
  | { ok: false; error: string };

const DATE_UNAVAILABLE =
  "That delivery date is no longer available - please pick another." as const;
const GENERIC_ERROR = "Couldn't submit your inquiry. Please try again." as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

// Unambiguous code alphabet — no 0/O, 1/I/L (easy to read out over phone/WhatsApp).
const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * Human-friendly, deterministic inquiry reference: "ZI-<MMDD>-<CODE>".
 *  - <MMDD> = the delivery date's month+day (from the payload, NOT the DB).
 *  - <CODE> = 5 chars from REF_ALPHABET, derived PURELY from the submission_token.
 * Identical algorithm to consultation.ts:119-128 (only the "ZI-" prefix differs),
 * so a retried submit — which collides on the submission_token unique index —
 * resolves to the SAME ref without reading the row back.
 */
function refFromToken(submissionToken: string, deliveryDate: string): string {
  const mmdd = deliveryDate.replace(/-/g, "").slice(4, 8); // "2026-09-01" → "0901"
  const hex = submissionToken.replace(/-/g, "");
  let code = "";
  for (let i = 0; i < 5; i += 1) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2) || "0", 16);
    code += REF_ALPHABET[byte % REF_ALPHABET.length];
  }
  return `ZI-${mmdd}-${code}`;
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

// ── Inquiry submission ─────────────────────────────────────────────────────────

export async function submitInquiry(
  input: SubmitInquiryInput,
): Promise<SubmitInquiryResult> {
  // 1) Validate + honeypot.
  const parsed = inquirySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid details." };
  }
  const data = parsed.data;

  if (data.website.trim() !== "") {
    // Bot: pretend it worked, write nothing.
    return { ok: true, ref: refFromToken(data.submissionToken, data.deliveryDate) };
  }

  const { name, email, phone, deliveryDate, submissionToken } = data;
  const phoneNormalised = phone.replace(/[\s-]/g, "");
  const ref = refFromToken(submissionToken, deliveryDate);

  // 2) Fresh server re-check of the delivery window (the client window is forgeable).
  const w = await getDeliveryWindow();
  if (deliveryDate < w.minISO || deliveryDate > w.maxISO) {
    return { ok: false, error: DATE_UNAVAILABLE };
  }

  // 3) Server-stamp consent context.
  const h = await headers();
  const consentIp = clientIp(h.get("x-forwarded-for"), h.get("x-real-ip"));
  const consentUa = h.get("user-agent");

  // 4) Build the per-mode payload. members / image_urls go in as JS arrays
  //    (jsonb — NO JSON.stringify); always [] never null.
  const supabase = await createClient();

  const isIndividual = data.mode === "individual";
  const row: {
    ref: string;
    mode: string;
    name: string;
    email: string;
    phone: string;
    delivery_date: string;
    garment: string | null;
    requirements: string | null;
    theme: string | null;
    bust_chest: string | null;
    size_unit: string | null;
    members: unknown[];
    image_urls: string[];
    image_note: string | null;
    agreed_terms: true;
    consent_ip: string | null;
    consent_ua: string | null;
    status: "new";
    submission_token: string;
  } = {
    ref,
    mode: data.mode,
    name,
    email,
    phone: phoneNormalised,
    delivery_date: deliveryDate,
    garment: isIndividual ? data.garment : null,
    requirements: isIndividual ? data.requirements : null,
    theme: isIndividual ? null : data.theme,
    bust_chest: isIndividual ? data.bust_chest ?? null : null,
    size_unit: data.size_unit ?? null,
    members: isIndividual ? [] : data.members,
    image_urls: data.imageUrls,
    image_note: null,
    agreed_terms: true,
    consent_ip: consentIp,
    consent_ua: consentUa,
    status: "new",
    submission_token: submissionToken,
  };

  // 5) INSERT. Under anon RLS we can't read the row back, so we don't .select().
  const { error } = await supabase.from("design_inquiries").insert(row);

  if (error) {
    if (isUniqueViolation(error)) {
      // Two unique constraints can raise 23505 (we can't read the row back under
      // guest RLS, so disambiguate by name):
      //  - submission_token idx → an idempotent retry of THIS inquiry → success.
      //  - ref key (design_inquiries_ref_key) → an astronomically-rare
      //    deterministic-ref collision between two DIFFERENT inquiries; NOT a
      //    stored success — log it and ask the user to retry.
      if (error.message?.includes("design_inquiries_submission_token_idx")) {
        return { ok: true, ref };
      }
      console.error("[inquiry] unexpected unique violation", error);
      return { ok: false, error: GENERIC_ERROR };
    }
    console.error("[inquiry] insert failed", error);
    return { ok: false, error: GENERIC_ERROR };
  }

  // 6) Activity log (best-effort — NEVER fails the submit). No email.
  try {
    const description =
      data.mode === "individual"
        ? `An individual (${name}) submitted a design inquiry — ${ref}`
        : `A group of ${data.members.length} submitted a design inquiry — ${ref}`;
    await supabase.from("activity_logs").insert({
      type: "Design Inquiry",
      description,
      metadata: {
        ref,
        mode: data.mode,
        email,
        phone: phoneNormalised,
        delivery_date: deliveryDate,
      },
    });
  } catch (logErr) {
    console.error("[inquiry] activity_logs insert failed", logErr);
  }

  return { ok: true, ref };
}
