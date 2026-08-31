"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  MdOutlineSync,
  MdOutlineCheckCircle,
  MdOutlineCloudUpload,
  MdOutlineClose,
  MdOutlineVideocam,
  MdOutlineEvent,
  MdOutlineSchedule,
} from "react-icons/md";
import { FaWhatsapp } from "react-icons/fa6";

import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import { Calendar } from "@/components/ui/Calendar";
import { TimeSlots } from "@/components/ui/TimeSlots";
import { uuidV4 } from "@/utils/consultation";
import {
  getAvailableSlotsAction,
  submitConsultation,
  type CustomisationSubmitInput,
} from "@/app/actions/consultation";

// ── Types ────────────────────────────────────────────────────────────────────

type Method = CustomisationSubmitInput["method"];

interface ConsultationFormProps {
  todayISO: string;
  maxISO: string;
  daysOff: string[];
}

interface SuccessInfo {
  ref: string;
  date: string;
  time: string;
  method: Method;
}

// ── Validation (mirrors the server Zod) ──────────────────────────────────────

const IN_MOBILE_RE = /^(?:\+?91|0)?[6-9]\d{9}$/;
const SLOT_TAKEN_HINT = "just taken";

const METHOD_LABELS: Record<Method, string> = {
  google_meet: "Google Meet",
  whatsapp_video: "WhatsApp Video",
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** "17:00" -> "5:00 PM" for the success summary. */
function to12Hour(hhmm: string): string {
  const [h = "0", m = "00"] = hhmm.split(":");
  const hour = Number(h);
  const period = hour >= 12 ? "PM" : "AM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${m} ${period}`;
}

/** "2026-08-31" -> "Monday, 31 August 2026" (TZ-safe via UTC noon). */
function prettyDate(iso: string): string {
  const [y = "0", m = "1", d = "1"] = iso.split("-");
  const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12));
  return dt.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// ── Small presentational helpers ─────────────────────────────────────────────

function SectionChip({ n }: { n: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 font-jost text-sm font-medium tracking-wide text-primary">
      {n}
    </span>
  );
}

function SectionHead({ n, title }: { n: string; title: string }) {
  return (
    <div className="mb-6 flex items-center gap-3">
      <SectionChip n={n} />
      <h2 className="cormorant text-2xl text-primary-dark md:text-[28px]">
        {title}
      </h2>
    </div>
  );
}

const cardClass =
  "bg-white border border-border rounded-2xl p-6 md:p-8";

const textareaClass =
  "w-full rounded-xl border border-outline-variant bg-white px-4 py-3 font-jost text-base outline-none transition-all hover:border-primary/50 focus:border-primary focus:ring-4 focus:ring-primary/5 resize-none";

// ── Component ────────────────────────────────────────────────────────────────

export default function ConsultationForm({
  todayISO,
  maxISO,
  daysOff,
}: ConsultationFormProps) {
  // Submission token — stable across renders and across identical retries (so a
  // double-click / network retry maps to the SAME booking, idempotently), but
  // REGENERATED whenever the chosen date/time changes, so picking a different
  // slot is a genuinely distinct booking attempt (never idempotently collapsed
  // onto a stale slot the customer moved away from).
  const [submissionToken, setSubmissionToken] = useState<string>(() => uuidV4());
  const freshToken = useCallback(() => setSubmissionToken(uuidV4()), []);

  // Schedule
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  // Details
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [method, setMethod] = useState<Method>("google_meet");

  // Vision
  const [notes, setNotes] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageNote, setImageNote] = useState("");
  const [uploading, setUploading] = useState(false);

  // Honeypot
  const [website, setWebsite] = useState("");

  // Consent
  const [agreed, setAgreed] = useState(false);

  // Inline field errors
  const [errors, setErrors] = useState<{
    name?: string;
    email?: string;
    phone?: string;
  }>({});

  // Submission lifecycle
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<SuccessInfo | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Toast
  const [toast, setToast] = useState({ show: false, message: "", error: false });
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string, error = false) => {
    setToast({ show: true, message, error });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(
      () => setToast({ show: false, message: "", error: false }),
      4000,
    );
  }, []);
  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // On success the tall form is replaced by the shorter confirmation screen — but
  // the page is still scrolled to the bottom (where Confirm was clicked), so the
  // user would land on the footer. Jump back to the top to show the confirmation.
  useEffect(() => {
    if (success) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [success]);

  // ── Availability: refetch slots whenever the date changes ──────────────────
  const loadSlots = useCallback(async (dateISO: string) => {
    setSlotsLoading(true);
    try {
      const fresh = await getAvailableSlotsAction(dateISO);
      setSlots(fresh);
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  const handleDateChange = useCallback(
    (iso: string) => {
      setDate(iso);
      setTime(null); // a new day invalidates any prior time
      freshToken(); // a changed schedule is a new booking attempt
      void loadSlots(iso);
    },
    [loadSlots, freshToken],
  );

  const handleTimeChange = useCallback(
    (t: string) => {
      setTime(t);
      freshToken(); // a changed schedule is a new booking attempt
    },
    [freshToken],
  );

  // ── Image upload ───────────────────────────────────────────────────────────
  const handleFile = useCallback(
    async (file: File) => {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        showToast("Please upload a JPG, PNG or WebP image.", true);
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        showToast("Image must be 5 MB or smaller.", true);
        return;
      }
      setUploading(true);
      try {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/consultation-upload", {
          method: "POST",
          body,
        });
        const json: { url?: string; error?: string } = await res.json();
        if (!res.ok || !json.url) {
          showToast(json.error ?? "Couldn't upload the image. Please try again.", true);
          return;
        }
        setImageUrl(json.url);
      } catch {
        showToast("Couldn't upload the image. Please try again.", true);
      } finally {
        setUploading(false);
      }
    },
    [showToast],
  );

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    // Reset so choosing the same file again still fires change.
    e.target.value = "";
  };

  const removeImage = () => {
    setImageUrl("");
    setImageNote("");
  };

  // ── Client-side validation (mirrors server Zod) ────────────────────────────
  const validate = (): boolean => {
    const next: typeof errors = {};
    const nameTrim = name.trim();
    if (nameTrim.length < 2) next.name = "Please enter your name.";
    else if (nameTrim.length > 80) next.name = "Name is too long.";

    const emailTrim = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim))
      next.email = "Please enter a valid email address.";

    const phoneClean = phone.replace(/[\s-]/g, "");
    if (!IN_MOBILE_RE.test(phoneClean))
      next.phone = "Please enter a valid Indian mobile number.";

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  // Gate: date + time + non-empty valid-ish fields + consent.
  const canSubmit =
    !!date &&
    !!time &&
    name.trim().length >= 2 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    IN_MOBILE_RE.test(phone.replace(/[\s-]/g, "")) &&
    agreed &&
    !submitting &&
    !uploading;

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return; // prevent double-submit
    if (!date || !time) {
      showToast("Please select a date and time.", true);
      return;
    }
    if (!agreed) {
      showToast("Please accept the Terms of Service and Privacy Policy.", true);
      return;
    }
    if (!validate()) {
      showToast("Please fix the highlighted fields.", true);
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitConsultation({
        name: name.trim(),
        email: email.trim(),
        phone: phone.replace(/[\s-]/g, ""),
        method,
        slotDate: date,
        slotTime: time,
        notes: notes.trim() || undefined,
        imageUrl: imageUrl || "",
        imageNote: imageNote.trim() || undefined,
        agreedTerms: true,
        submissionToken,
        website,
      });

      if (result.ok) {
        setSuccess({ ref: result.ref, date, time, method });
        return;
      }

      showToast(result.error, true);
      // If the slot was just taken, refresh availability for the current date.
      if (result.error.toLowerCase().includes(SLOT_TAKEN_HINT)) {
        setTime(null);
        void loadSlots(date);
      }
    } catch {
      showToast("Something went wrong. Please try again.", true);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className={`${cardClass} text-center`}>
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MdOutlineCheckCircle className="text-4xl" />
        </div>
        <h2 className="cormorant text-3xl text-primary-dark md:text-4xl">
          Your consultation is booked
        </h2>
        <p className="mt-3 font-jost text-sm text-muted">
          Booking reference
        </p>
        <p className="mt-1 font-jost text-lg font-medium tracking-wide text-primary-dark">
          {success.ref}
        </p>

        <div className="mx-auto mt-8 max-w-sm space-y-3 text-left">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface/40 px-4 py-3">
            <MdOutlineEvent className="text-xl text-primary" />
            <span className="font-jost text-sm text-primary-dark">
              {prettyDate(success.date)}
            </span>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface/40 px-4 py-3">
            <MdOutlineSchedule className="text-xl text-primary" />
            <span className="font-jost text-sm text-primary-dark">
              {to12Hour(success.time)}{" "}
              <span className="text-muted">IST (UTC +5:30)</span>
            </span>
          </div>
          <div className="flex items-center gap-3 rounded-xl border border-border bg-surface/40 px-4 py-3">
            {success.method === "whatsapp_video" ? (
              <FaWhatsapp className="text-xl text-primary" />
            ) : (
              <MdOutlineVideocam className="text-xl text-primary" />
            )}
            <span className="font-jost text-sm text-primary-dark">
              {METHOD_LABELS[success.method]}
            </span>
          </div>
        </div>

        <p className="mx-auto mt-8 max-w-sm font-jost text-sm leading-6 text-muted">
          We&apos;ll share your{" "}
          {success.method === "whatsapp_video" ? "WhatsApp" : "Google Meet"} link
          shortly.
        </p>

        <Link
          href="/customisation"
          className="mt-8 inline-block font-jost text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to Customisation Studio
        </Link>
      </div>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8">
        {/* 01 · Select Date & Time */}
        <section className={cardClass}>
          <SectionHead n="01" title="Select Date & Time" />

          <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
            {/* Calendar */}
            <div>
              <Calendar
                value={date}
                onChange={handleDateChange}
                minISO={todayISO}
                maxISO={maxISO}
                disabledDates={daysOff}
              />
            </div>

            {/* Times */}
            <div>
              <div className="mb-3 flex items-baseline justify-between">
                <span className="block font-jost text-sm font-medium text-on-surface-variant">
                  Select Time
                </span>
                <span className="font-jost text-xs text-muted">
                  IST (UTC +5:30)
                </span>
              </div>

              {date ? (
                <TimeSlots
                  slots={slots}
                  value={time}
                  loading={slotsLoading}
                  onChange={handleTimeChange}
                />
              ) : (
                <p className="rounded-xl border border-border bg-surface/60 px-4 py-6 text-center font-jost text-sm text-muted">
                  Pick a date to see available times.
                </p>
              )}
            </div>
          </div>
        </section>

        {/* 02 · Your Details */}
        <section className={cardClass}>
          <SectionHead n="02" title="Your Details" />

          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Input
                label="Full Name"
                placeholder="John Doe"
                type="text"
                required
                value={name}
                error={errors.name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
                }}
              />
              <Input
                label="Email Address"
                placeholder="john@example.com"
                type="email"
                required
                value={email}
                error={errors.email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
                }}
              />
            </div>

            <Input
              label="WhatsApp Number"
              placeholder="+91 98765 43210"
              type="tel"
              inputMode="tel"
              required
              value={phone}
              error={errors.phone}
              onChange={(e) => {
                // Allow digits, spaces and a leading + (so "+91 98765 43210"
                // enters cleanly, matching the Contact Us field); block letters
                // and other symbols.
                setPhone(e.target.value.replace(/[^\d\s+]/g, "").slice(0, 16));
                if (errors.phone) setErrors((p) => ({ ...p, phone: undefined }));
              }}
            />

            {/* Consultation method */}
            <fieldset>
              <legend className="mb-2 ml-1 block font-jost text-sm font-medium text-on-surface-variant">
                Consultation method
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {(Object.keys(METHOD_LABELS) as Method[]).map((m) => {
                  const selected = method === m;
                  return (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setMethod(m)}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left font-jost text-sm transition-all ${
                        selected
                          ? "border-[#2C3829] bg-[#2C3829] font-medium text-white"
                          : "border-border bg-white text-primary-dark hover:border-primary/50 hover:bg-surface"
                      }`}
                    >
                      {m === "whatsapp_video" ? (
                        <FaWhatsapp className="text-lg shrink-0" />
                      ) : (
                        <MdOutlineVideocam className="text-lg shrink-0" />
                      )}
                      {METHOD_LABELS[m]}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>
        </section>

        {/* 03 · Vision & Inspiration */}
        <section className={cardClass}>
          <SectionHead n="03" title="Vision & Inspiration" />

          <div className="space-y-6">
            <div>
              <label className="mb-2 ml-1 block font-jost text-sm font-medium text-on-surface-variant">
                Tell us about your dream outfit
              </label>
              <textarea
                rows={5}
                value={notes}
                maxLength={2000}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Share the occasion, silhouette, fabrics, colours or any references you have in mind..."
                className={textareaClass}
              />
            </div>

            {/* Image dropzone */}
            <div>
              <label className="mb-2 ml-1 block font-jost text-sm font-medium text-on-surface-variant">
                Reference image
              </label>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={onFileInputChange}
              />

              {imageUrl ? (
                <div className="flex items-center gap-4 rounded-xl border border-border bg-surface/40 p-3">
                  <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border">
                    <Image
                      src={imageUrl}
                      alt="Reference"
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-jost text-sm text-primary-dark">
                      Reference image added
                    </p>
                    <button
                      type="button"
                      onClick={removeImage}
                      className="mt-1 inline-flex items-center gap-1 font-jost text-xs text-secondary hover:underline"
                    >
                      <MdOutlineClose className="text-sm" />
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-surface/30 px-4 py-8 text-center transition-colors hover:border-primary/50 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {uploading ? (
                    <>
                      <MdOutlineSync className="animate-spin text-2xl text-primary" />
                      <span className="font-jost text-sm text-muted">
                        Uploading...
                      </span>
                    </>
                  ) : (
                    <>
                      <MdOutlineCloudUpload className="text-2xl text-primary" />
                      <span className="font-jost text-sm text-primary-dark">
                        Click to upload reference image
                      </span>
                      <span className="font-jost text-xs text-muted">
                        JPG/PNG/WebP up to 5MB
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>

            {imageUrl && (
              <Input
                label="A note about this image"
                placeholder="e.g. I love the neckline, but in emerald green"
                type="text"
                maxLength={500}
                value={imageNote}
                onChange={(e) => setImageNote(e.target.value)}
              />
            )}
          </div>
        </section>

        {/* Consent */}
        <div className="px-1">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer rounded border-border accent-[#2C3829]"
            />
            <span className="font-jost text-sm leading-6 text-primary-dark/80">
              I agree to ZIEA&apos;s{" "}
              <Link
                href="/terms-and-conditions"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-2 hover:underline"
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-2 hover:underline"
              >
                Privacy Policy
              </Link>
              .
            </span>
          </label>
        </div>

        {/* Honeypot — visually hidden, never focusable, kept empty by real users. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0"
          style={{ left: "-9999px" }}
        >
          <label>
            Do not fill this in
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              name="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
            />
          </label>
        </div>

        {/* Confirm — inline at the bottom of the form on all breakpoints */}
        <div className="pt-2">
          <Button
            variant="auth-primary"
            type="submit"
            disabled={!canSubmit}
            className="mx-auto w-full max-w-4xl gap-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? (
              <>
                <MdOutlineSync className="animate-spin text-xl" />
                Confirming...
              </>
            ) : (
              "Confirm Consultation"
            )}
          </Button>
        </div>
      </form>

      <Toast show={toast.show} message={toast.message} error={toast.error} />
    </>
  );
}
