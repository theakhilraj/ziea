"use server";

import { z } from "zod";
import { Resend } from "resend";

// "Created by Protoform Technologies" footer enquiry → emailed via Resend so the
// studio gets an instant notification. Name + email required; phone + message
// optional. Recipient / sender / API key come from env (never hard-coded).
const enquirySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Please enter your name.")
    .max(80, "Name is too long."),
  email: z.string().trim().email("Please enter a valid email address."),
  phone: z
    .string()
    .trim()
    .max(20)
    .refine(
      (v) => v === "" || /^(?:\+?\d[\d\s-]{6,18}\d)$/.test(v),
      "Please enter a valid phone number.",
    )
    .optional()
    .default(""),
  message: z.string().trim().max(2000, "Message is too long.").optional().default(""),
});

export type ProtoformEnquiryInput = z.input<typeof enquirySchema>;
export type ProtoformResult = { ok: true } | { ok: false; error: string };

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendProtoformEnquiry(
  input: ProtoformEnquiryInput,
): Promise<ProtoformResult> {
  const parsed = enquirySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid details." };
  }
  const { name, email, phone, message } = parsed.data;

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.PROTOFORM_ENQUIRY_TO;
  // Must be an address on a domain verified in Resend. Falls back to Resend's
  // shared sender (only delivers to the account owner) so dev testing works.
  const from = process.env.PROTOFORM_ENQUIRY_FROM ?? "Protoform Enquiries <onboarding@resend.dev>";

  if (!apiKey || !to) {
    console.error("[protoform] RESEND_API_KEY or PROTOFORM_ENQUIRY_TO is not set");
    return { ok: false, error: "Email service isn't configured yet. Please try again later." };
  }

  const resend = new Resend(apiKey);

  const rows: Array<[string, string]> = [
    ["Name", name],
    ["Email", email],
    ["Phone", phone || "-"],
    ["Message", message || "-"],
  ];

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#2C3829">
      <div style="background:#2C3829;color:#F5F0E8;padding:20px 24px;border-radius:12px 12px 0 0">
        <h2 style="margin:0;font-size:18px">New enquiry — Protoform Technologies</h2>
        <p style="margin:6px 0 0;font-size:13px;color:#c8d1c0">Sent from the ZIEA website footer</p>
      </div>
      <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e2dccf;border-top:none;border-radius:0 0 12px 12px">
        ${rows
      .map(
        ([k, v]) => `
          <tr>
            <td style="padding:12px 16px;border-top:1px solid #eee;font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#7A7068;width:110px;vertical-align:top">${k}</td>
            <td style="padding:12px 16px;border-top:1px solid #eee;font-size:14px;color:#2C3829;white-space:pre-wrap">${escapeHtml(v)}</td>
          </tr>`,
      )
      .join("")}
      </table>
    </div>`;

  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n");

  try {
    const { error } = await resend.emails.send({
      from,
      to: [to],
      replyTo: email,
      subject: `New enquiry from ${name} - Protoform (via ZIEA)`,
      html,
      text,
    });
    if (error) {
      console.error("[protoform] resend error", error);
      return { ok: false, error: "Couldn't send right now. Please try again." };
    }
    return { ok: true };
  } catch (err) {
    console.error("[protoform] send failed", err);
    return { ok: false, error: "Couldn't send right now. Please try again." };
  }
}
