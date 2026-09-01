"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  MdOutlineSync,
  MdOutlineCheckCircle,
  MdOutlineCloudUpload,
  MdOutlineClose,
  MdOutlineDeleteOutline,
  MdOutlineAdd,
  MdOutlinePerson,
  MdOutlineGroups,
} from "react-icons/md";

import { Input } from "@/components/ui/Input";
import { Select, type SelectOption } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import { Calendar } from "@/components/ui/Calendar";
import {
  uuidV4,
  MEMBERS_MAX,
  MOODBOARD_MAX,
  GARMENT_TYPES,
  type InquiryMode,
} from "@/utils/inquiry";
import { submitInquiry, type SubmitInquiryInput } from "@/app/actions/inquiry";

// ── Types ────────────────────────────────────────────────────────────────────

interface DesignInquiryFormProps {
  todayISO: string;
  minISO: string;
  maxISO: string;
  disabledDates: string[];
}

type SizeUnit = "cm" | "inches";

/** A group-member row in the repeater (bustChest kept as a string while typing).
 *  `garment` is the selected option; when it is "Other", `garmentOther` holds the
 *  custom free-text the customer typed. */
interface MemberRow {
  name: string;
  garment: string;
  garmentOther: string;
  bustChest: string;
}

interface SuccessInfo {
  ref: string;
}

// ── Validation (mirrors the server Zod) ──────────────────────────────────────

const IN_MOBILE_RE = /^(?:\+?91|0)?[6-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const SIZE_UNIT_OPTIONS: SelectOption[] = [
  { value: "cm", label: "Centimetres (cm)" },
  { value: "inches", label: "Inches" },
];

const GARMENT_OPTIONS: SelectOption[] = GARMENT_TYPES.map((g) => ({
  value: g,
  label: g,
}));

function emptyMember(): MemberRow {
  return { name: "", garment: "", garmentOther: "", bustChest: "" };
}

/** The final garment string: the custom free-text when "Other" is chosen (a
 *  non-preset garment the customer typed), otherwise the selected preset. */
function resolveGarment(garment: string, other: string): string {
  return garment === "Other" ? other.trim() : garment;
}

/** True once a garment selection is complete: a preset is picked, or "Other" is
 *  picked AND the free-text is filled. */
function garmentComplete(garment: string, other: string): boolean {
  return garment !== "" && (garment !== "Other" || other.trim().length >= 1);
}

// Single source of truth for member completeness: mirrors the server
// memberSchema (name >= 1, garment resolved, bustChest int in [1, 200]). Used
// for BOTH the completeness count and the submit-payload filter so they can never
// drift — a member that is counted is exactly a member that is serialized.
function isCompleteMember(m: MemberRow): boolean {
  return (
    m.name.trim().length >= 1 &&
    garmentComplete(m.garment, m.garmentOther) &&
    /^\d{1,3}$/.test(m.bustChest) &&
    Number(m.bustChest) >= 1 &&
    Number(m.bustChest) <= 200
  );
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

const cardClass = "bg-white border border-border rounded-2xl p-6 md:p-8";

const textareaClass =
  "w-full rounded-xl border border-outline-variant bg-white px-4 py-3 font-jost text-base outline-none transition-all hover:border-primary/50 focus:border-primary focus:ring-4 focus:ring-primary/5 resize-none";

// ── Component ────────────────────────────────────────────────────────────────

export default function DesignInquiryForm({
  todayISO,
  minISO,
  maxISO,
  disabledDates,
}: DesignInquiryFormProps) {
  // Submission token — stable across renders + identical retries (so a
  // double-click / network retry maps to the SAME inquiry, idempotently), but
  // REGENERATED whenever the chosen delivery date changes OR the mode toggles,
  // so those become genuinely distinct submission attempts.
  const [submissionToken, setSubmissionToken] = useState<string>(() => uuidV4());
  const freshToken = useCallback(() => setSubmissionToken(uuidV4()), []);

  // Mode
  const [mode, setMode] = useState<InquiryMode>("individual");

  // Shared contact (persists across a mode toggle)
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Shared schedule (persists) — start on the first selectable day (never a
  // disabled lead-time day).
  const [deliveryDate, setDeliveryDate] = useState<string>(minISO);

  // Individual — Vision
  const [garment, setGarment] = useState("");
  const [garmentOther, setGarmentOther] = useState("");
  const [requirements, setRequirements] = useState("");
  const [bustChest, setBustChest] = useState("");
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>("cm");
  const [imageNote, setImageNote] = useState("");

  // Group — Theme + shared unit + members
  const [theme, setTheme] = useState("");
  const [groupUnit, setGroupUnit] = useState<SizeUnit>("cm");
  const [members, setMembers] = useState<MemberRow[]>(() => [
    emptyMember(),
    emptyMember(),
  ]);

  // Images — RESET on mode toggle (individual max 1, group moodboard max 10).
  const [images, setImages] = useState<string[]>([]);
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
    garment?: string;
    requirements?: string;
    bust_chest?: string;
    theme?: string;
    size_unit?: string;
    members?: string;
    images?: string;
  }>({});

  // Submission lifecycle
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<SuccessInfo | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const moodboardInputRef = useRef<HTMLInputElement>(null);

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

  // On success the tall form is replaced by the shorter confirmation screen —
  // but the page is still scrolled to where Submit was clicked, so the user
  // would land on the footer. Jump back to the top to show the confirmation.
  useEffect(() => {
    if (success) window.scrollTo({ top: 0, behavior: "smooth" });
  }, [success]);

  // ── Mode toggle ─────────────────────────────────────────────────────────────
  const switchMode = useCallback(
    (next: InquiryMode) => {
      if (next === mode) return;
      setMode(next);
      // Images differ per mode (1 vs many) — reset them; keep contact/date/etc.
      setImages([]);
      setImageNote("");
      setErrors({});
      freshToken(); // a mode switch is a genuinely distinct submission attempt
    },
    [mode, freshToken],
  );

  // ── Delivery date ───────────────────────────────────────────────────────────
  const handleDateChange = useCallback(
    (iso: string) => {
      setDeliveryDate(iso);
      freshToken(); // a changed delivery date is a new submission attempt
    },
    [freshToken],
  );

  // ── Image upload (shared handler → POST /api/inquiry-upload) ────────────────
  const uploadFile = useCallback(
    async (file: File): Promise<string | null> => {
      if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
        showToast("Please upload a JPG, PNG or WebP image.", true);
        return null;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        showToast("Image must be 5 MB or smaller.", true);
        return null;
      }
      setUploading(true);
      try {
        const body = new FormData();
        body.append("file", file);
        const res = await fetch("/api/inquiry-upload", { method: "POST", body });
        const json: { url?: string; error?: string } = await res.json();
        if (!res.ok || !json.url) {
          showToast(
            json.error ?? "Couldn't upload the image. Please try again.",
            true,
          );
          return null;
        }
        return json.url;
      } catch {
        showToast("Couldn't upload the image. Please try again.", true);
        return null;
      } finally {
        setUploading(false);
      }
    },
    [showToast],
  );

  // Individual — single reference image (max 1).
  const onSingleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    const url = await uploadFile(file);
    if (url) {
      setImages([url]);
      if (errors.images) setErrors((p) => ({ ...p, images: undefined }));
    }
  };

  const removeSingleImage = () => {
    setImages([]);
    setImageNote("");
  };

  // Group — moodboard (max MOODBOARD_MAX).
  const onMoodboardChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (images.length >= MOODBOARD_MAX) {
      showToast(`You can add up to ${MOODBOARD_MAX} images.`, true);
      return;
    }
    const url = await uploadFile(file);
    if (url) {
      setImages((prev) => [...prev, url]);
      if (errors.images) setErrors((p) => ({ ...p, images: undefined }));
    }
  };

  const removeMoodboardImage = (idx: number) => {
    setImages((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Members repeater ────────────────────────────────────────────────────────
  const updateMember = (idx: number, patch: Partial<MemberRow>) => {
    setMembers((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, ...patch } : m)),
    );
    if (errors.members) setErrors((p) => ({ ...p, members: undefined }));
  };

  const addMember = () => {
    setMembers((prev) =>
      prev.length >= MEMBERS_MAX ? prev : [...prev, emptyMember()],
    );
  };

  const removeMember = (idx: number) => {
    setMembers((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== idx)));
  };

  const completeMemberCount = members.filter(isCompleteMember).length;
  const groupReady = completeMemberCount >= 2;

  // ── Validation (mirrors the server Zod, per mode) ───────────────────────────
  const validateContact = (next: typeof errors) => {
    const nameTrim = name.trim();
    if (nameTrim.length < 2) next.name = "Please enter your name.";
    else if (nameTrim.length > 80) next.name = "Name is too long.";

    if (!EMAIL_RE.test(email.trim()))
      next.email = "Please enter a valid email address.";

    const phoneClean = phone.replace(/[\s-]/g, "");
    if (!IN_MOBILE_RE.test(phoneClean))
      next.phone = "Please enter a valid Indian mobile number.";
  };

  const validate = (): boolean => {
    const next: typeof errors = {};
    validateContact(next);

    if (mode === "individual") {
      if (!garmentComplete(garment, garmentOther))
        next.garment =
          garment === "Other"
            ? "Please specify what you're looking for."
            : "Please choose what you're looking for.";

      if (requirements.trim().length < 1)
        next.requirements = "Please describe your requirements.";
      else if (requirements.trim().length > 2000)
        next.requirements = "Requirements are too long.";

      // Bust/chest is optional; the unit is always set (cm or inches).
      const bust = bustChest.trim();
      if (bust !== "") {
        if (!/^\d{1,3}$/.test(bust))
          next.bust_chest = "Enter a valid measurement.";
        else if (Number(bust) < 1 || Number(bust) > 200)
          next.bust_chest = "Enter a measurement between 1 and 200.";
      }
    } else {
      if (theme.trim().length < 1) next.theme = "Please describe your theme.";
      else if (theme.trim().length > 2000) next.theme = "Theme is too long.";

      if (completeMemberCount < 2)
        next.members = "Add at least 2 complete members.";

      if (images.length < 1) next.images = "Add at least one moodboard image.";
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  // ── canSubmit gate (branches on the CURRENT mode) ───────────────────────────
  const contactValid =
    name.trim().length >= 2 &&
    EMAIL_RE.test(email.trim()) &&
    IN_MOBILE_RE.test(phone.replace(/[\s-]/g, ""));

  const canSubmit =
    contactValid &&
    !!deliveryDate &&
    agreed &&
    !submitting &&
    !uploading &&
    (mode === "individual"
      ? requirements.trim().length >= 1 &&
        garmentComplete(garment, garmentOther)
      : theme.trim().length >= 1 && groupReady && images.length >= 1);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return; // prevent double-submit
    if (!agreed) {
      showToast("Please accept the Terms of Service and Privacy Policy.", true);
      return;
    }
    if (!validate()) {
      showToast("Please fix the highlighted fields.", true);
      return;
    }

    // Build the discriminated-union payload EXACTLY matching app/actions/inquiry.
    let payload: SubmitInquiryInput;
    const shared = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.replace(/[\s-]/g, ""),
      deliveryDate,
      agreedTerms: true as const,
      submissionToken,
      website,
    };

    if (mode === "individual") {
      const hasSizing = bustChest.trim() !== "";
      payload = {
        ...shared,
        mode: "individual",
        garment: resolveGarment(garment, garmentOther),
        requirements: requirements.trim(),
        bust_chest: hasSizing ? bustChest.trim() : undefined,
        size_unit: hasSizing ? sizeUnit : undefined,
        imageUrls: images.slice(0, 1),
      };
    } else {
      payload = {
        ...shared,
        mode: "group",
        theme: theme.trim(),
        size_unit: groupUnit as SizeUnit,
        members: members
          .filter(isCompleteMember)
          .map((m) => ({
            name: m.name.trim(),
            garment: resolveGarment(m.garment, m.garmentOther),
            bustChest: Number(m.bustChest),
          })),
        imageUrls: images,
      };
    }

    setSubmitting(true);
    try {
      const result = await submitInquiry(payload);
      if (result.ok) {
        setSuccess({ ref: result.ref });
        return;
      }
      showToast(result.error, true);
    } catch {
      showToast("Something went wrong. Please try again.", true);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className={`${cardClass} text-center`}>
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MdOutlineCheckCircle className="text-4xl" />
        </div>
        <h2 className="cormorant text-3xl text-primary-dark md:text-4xl">
          Your inquiry is received
        </h2>
        <p className="mt-3 font-jost text-sm text-muted">Inquiry reference</p>
        <p className="mt-1 font-jost text-lg font-medium tracking-wide text-primary-dark">
          {success.ref}
        </p>

        <p className="mx-auto mt-8 max-w-sm font-jost text-sm leading-6 text-muted">
          Our team will reach out shortly.
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

  // ── Form ────────────────────────────────────────────────────────────────────
  const isIndividual = mode === "individual";

  return (
    <>
      {/* Mode toggle */}
      <div className="mb-6 flex justify-center md:mb-8">
        <div
          role="tablist"
          aria-label="Inquiry type"
          className="inline-flex rounded-full border border-border bg-white p-1"
        >
          {(
            [
              { key: "individual", label: "Individual", Icon: MdOutlinePerson },
              { key: "group", label: "Group", Icon: MdOutlineGroups },
            ] as const
          ).map(({ key, label, Icon }) => {
            const active = mode === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => switchMode(key)}
                className={`flex items-center gap-2 rounded-full px-6 py-2.5 font-jost text-sm font-medium transition-all duration-300 ${
                  active
                    ? "bg-[#2C3829] text-[#F5F0E8] shadow-sm"
                    : "text-muted hover:text-primary-dark"
                }`}
              >
                <Icon className="text-lg" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 md:space-y-8">
        {/* Cross-faded body per mode */}
        <div key={mode} className="animate-in fade-in duration-300 space-y-6 md:space-y-8">
          {isIndividual ? (
            <>
              {/* 01 · Your Details */}
              <section className={cardClass}>
                <SectionHead n="01" title="Your Details" />
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
                        if (errors.name)
                          setErrors((p) => ({ ...p, name: undefined }));
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
                        if (errors.email)
                          setErrors((p) => ({ ...p, email: undefined }));
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
                      setPhone(e.target.value.replace(/[^\d\s+]/g, "").slice(0, 16));
                      if (errors.phone)
                        setErrors((p) => ({ ...p, phone: undefined }));
                    }}
                  />
                </div>
              </section>

              {/* 02 · Your Vision */}
              <section className={cardClass}>
                <SectionHead n="02" title="Your Vision" />
                <div className="space-y-6">
                  <div>
                    <Select
                      label="Looking for"
                      value={garment}
                      onChange={(v) => {
                        setGarment(v);
                        if (errors.garment)
                          setErrors((p) => ({ ...p, garment: undefined }));
                      }}
                      options={GARMENT_OPTIONS}
                      placeholder="Select a garment"
                      allowNone={false}
                    />
                    {garment === "Other" && (
                      <div className="mt-3">
                        <Input
                          label="Please specify"
                          placeholder="e.g. Sherwani, Indo-western, gown…"
                          type="text"
                          value={garmentOther}
                          onChange={(e) => {
                            setGarmentOther(e.target.value.slice(0, 80));
                            if (errors.garment)
                              setErrors((p) => ({ ...p, garment: undefined }));
                          }}
                        />
                      </div>
                    )}
                    {errors.garment && (
                      <p role="alert" className="mt-1 ml-1 font-jost text-xs text-red-500">
                        {errors.garment}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="mb-2 ml-1 block font-jost text-sm font-medium text-on-surface-variant">
                      Describe your requirements
                    </label>
                    <textarea
                      rows={5}
                      value={requirements}
                      maxLength={2000}
                      onChange={(e) => {
                        setRequirements(e.target.value);
                        if (errors.requirements)
                          setErrors((p) => ({ ...p, requirements: undefined }));
                      }}
                      placeholder="Share the occasion, silhouette, fabrics, colours or any references you have in mind..."
                      className={textareaClass}
                    />
                    {errors.requirements && (
                      <p role="alert" className="mt-1 ml-1 font-jost text-xs text-red-500">
                        {errors.requirements}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <Input
                      label="Bust / Chest (optional)"
                      placeholder="e.g. 36"
                      type="text"
                      inputMode="numeric"
                      value={bustChest}
                      error={errors.bust_chest}
                      onChange={(e) => {
                        setBustChest(e.target.value.replace(/\D/g, "").slice(0, 3));
                        if (errors.bust_chest)
                          setErrors((p) => ({ ...p, bust_chest: undefined }));
                      }}
                    />
                    <div>
                      <Select
                        label="Unit"
                        value={sizeUnit}
                        onChange={(v) => {
                          setSizeUnit(v as SizeUnit);
                          if (errors.bust_chest)
                            setErrors((p) => ({ ...p, bust_chest: undefined }));
                        }}
                        options={SIZE_UNIT_OPTIONS}
                        allowNone={false}
                      />
                    </div>
                  </div>
                </div>
              </section>

              {/* 03 · Reference Image */}
              <section className={cardClass}>
                <SectionHead n="03" title="Reference Image" />
                <div className="space-y-6">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={onSingleFileChange}
                  />

                  {images[0] ? (
                    <div className="flex items-center gap-4 rounded-xl border border-border bg-surface/40 p-3">
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border">
                        <Image
                          src={images[0]}
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
                          onClick={removeSingleImage}
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

                  {images[0] && (
                    <Input
                      label="A note about this image (optional)"
                      placeholder="e.g. I love the neckline, but in emerald green"
                      type="text"
                      maxLength={500}
                      value={imageNote}
                      onChange={(e) => setImageNote(e.target.value)}
                    />
                  )}
                </div>
              </section>

              {/* 04 · Preferred Delivery Date */}
              <section className={cardClass}>
                <SectionHead n="04" title="Preferred Delivery Date" />
                <div className="mx-auto max-w-sm">
                  <Calendar
                    value={deliveryDate}
                    onChange={handleDateChange}
                    minISO={minISO}
                    maxISO={maxISO}
                    todayISO={todayISO}
                    disabledDates={disabledDates}
                  />
                </div>
              </section>
            </>
          ) : (
            <>
              {/* 01 · Primary Contact */}
              <section className={cardClass}>
                <SectionHead n="01" title="Primary Contact" />
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
                        if (errors.name)
                          setErrors((p) => ({ ...p, name: undefined }));
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
                        if (errors.email)
                          setErrors((p) => ({ ...p, email: undefined }));
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
                      setPhone(e.target.value.replace(/[^\d\s+]/g, "").slice(0, 16));
                      if (errors.phone)
                        setErrors((p) => ({ ...p, phone: undefined }));
                    }}
                  />
                </div>
              </section>

              {/* 02 · Group Members */}
              <section className={cardClass}>
                <SectionHead n="02" title="Group Members" />

                <div className="mb-5 flex items-center justify-between">
                  {groupReady ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 font-jost text-xs font-medium text-primary">
                      <MdOutlineCheckCircle className="text-sm" />
                      Group ready
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-surface px-3 py-1 font-jost text-xs font-medium text-muted">
                      {completeMemberCount} of 2 minimum
                    </span>
                  )}
                </div>

                {errors.members && (
                  <p role="alert" className="mb-4 ml-1 font-jost text-xs text-red-500">
                    {errors.members}
                  </p>
                )}

                <div className="space-y-4">
                  {members.map((m, idx) => {
                    const atFloor = members.length <= 2;
                    return (
                      <div
                        key={idx}
                        className="rounded-xl border border-border bg-surface/30 p-4"
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <span className="font-jost text-xs font-medium uppercase tracking-[0.1em] text-muted">
                            Member {idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeMember(idx)}
                            disabled={atFloor}
                            title={atFloor ? "Minimum 2 members" : "Remove member"}
                            aria-label={`Remove member ${idx + 1}`}
                            className="flex h-8 w-8 items-center justify-center rounded-full text-secondary transition-colors hover:bg-secondary/10 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
                          >
                            <MdOutlineDeleteOutline className="text-lg" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                          <Input
                            label="Name"
                            placeholder="Member name"
                            type="text"
                            value={m.name}
                            onChange={(e) => updateMember(idx, { name: e.target.value })}
                          />
                          <div>
                            <Select
                              label="Looking for"
                              value={m.garment}
                              onChange={(v) => updateMember(idx, { garment: v })}
                              options={GARMENT_OPTIONS}
                              placeholder="Select a garment"
                              allowNone={false}
                            />
                            {m.garment === "Other" && (
                              <div className="mt-3">
                                <Input
                                  label="Please specify"
                                  placeholder="e.g. Sherwani…"
                                  type="text"
                                  value={m.garmentOther}
                                  onChange={(e) =>
                                    updateMember(idx, {
                                      garmentOther: e.target.value.slice(0, 80),
                                    })
                                  }
                                />
                              </div>
                            )}
                          </div>
                          <Input
                            label="Bust / Chest"
                            placeholder="e.g. 36"
                            type="text"
                            inputMode="numeric"
                            value={m.bustChest}
                            onChange={(e) =>
                              updateMember(idx, {
                                bustChest: e.target.value.replace(/\D/g, "").slice(0, 3),
                              })
                            }
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={addMember}
                  disabled={members.length >= MEMBERS_MAX}
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-dashed border-border px-5 py-2.5 font-jost text-sm font-medium text-primary-dark transition-colors hover:border-primary/50 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <MdOutlineAdd className="text-lg" />
                  Add member
                </button>
              </section>

              {/* 03 · Overall Theme */}
              <section className={cardClass}>
                <SectionHead n="03" title="Overall Theme" />
                <div className="space-y-6">
                  <div>
                    <label className="mb-2 ml-1 block font-jost text-sm font-medium text-on-surface-variant">
                      Describe the group&apos;s theme
                    </label>
                    <textarea
                      rows={5}
                      value={theme}
                      maxLength={2000}
                      onChange={(e) => {
                        setTheme(e.target.value);
                        if (errors.theme)
                          setErrors((p) => ({ ...p, theme: undefined }));
                      }}
                      placeholder="Share the occasion, colour palette, coordination style or references for the group..."
                      className={textareaClass}
                    />
                    {errors.theme && (
                      <p role="alert" className="mt-1 ml-1 font-jost text-xs text-red-500">
                        {errors.theme}
                      </p>
                    )}
                  </div>

                  <div className="max-w-xs">
                    <Select
                      label="Measurement unit (shared by all members)"
                      value={groupUnit}
                      onChange={(v) => setGroupUnit(v as SizeUnit)}
                      options={SIZE_UNIT_OPTIONS}
                      allowNone={false}
                    />
                    {errors.size_unit && (
                      <p role="alert" className="mt-1 ml-1 font-jost text-xs text-red-500">
                        {errors.size_unit}
                      </p>
                    )}
                  </div>
                </div>
              </section>

              {/* 04 · Preferred Delivery Date */}
              <section className={cardClass}>
                <SectionHead n="04" title="Preferred Delivery Date" />
                <div className="mx-auto max-w-sm">
                  <Calendar
                    value={deliveryDate}
                    onChange={handleDateChange}
                    minISO={minISO}
                    maxISO={maxISO}
                    todayISO={todayISO}
                    disabledDates={disabledDates}
                  />
                </div>
              </section>

              {/* 05 · Moodboard */}
              <section className={cardClass}>
                <SectionHead n="05" title="Moodboard" />
                <p className="mb-4 font-jost text-sm text-muted">
                  Add up to {MOODBOARD_MAX} images that capture the group&apos;s
                  vision.
                </p>

                <input
                  ref={moodboardInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={onMoodboardChange}
                />

                <div className="flex gap-3 overflow-x-auto pb-2">
                  {images.map((url, idx) => (
                    <div
                      key={url + idx}
                      className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-border"
                    >
                      <Image
                        src={url}
                        alt={`Moodboard ${idx + 1}`}
                        fill
                        sizes="96px"
                        className="object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => removeMoodboardImage(idx)}
                        aria-label={`Remove image ${idx + 1}`}
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-white/90 text-secondary shadow-sm transition-colors hover:bg-white"
                      >
                        <MdOutlineClose className="text-sm" />
                      </button>
                    </div>
                  ))}

                  {images.length < MOODBOARD_MAX && (
                    <button
                      type="button"
                      onClick={() => moodboardInputRef.current?.click()}
                      disabled={uploading}
                      aria-label="Add moodboard image"
                      className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-surface/30 text-center transition-colors hover:border-primary/50 hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {uploading ? (
                        <MdOutlineSync className="animate-spin text-xl text-primary" />
                      ) : (
                        <>
                          <MdOutlineAdd className="text-xl text-primary" />
                          <span className="font-jost text-[11px] text-muted">
                            Add
                          </span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {errors.images && (
                  <p role="alert" className="mt-2 ml-1 font-jost text-xs text-red-500">
                    {errors.images}
                  </p>
                )}
              </section>
            </>
          )}
        </div>

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

        {/* Submit — inline at the bottom of the form on all breakpoints */}
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
                Submitting...
              </>
            ) : (
              "Submit Design Inquiry"
            )}
          </Button>
        </div>
      </form>

      <Toast show={toast.show} message={toast.message} error={toast.error} />
    </>
  );
}
