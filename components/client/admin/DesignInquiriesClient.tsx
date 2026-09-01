"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  MdOutlineExpandMore,
  MdOutlineMailOutline,
  MdOutlinePhone,
  MdOutlineDesignServices,
  MdOutlineSchedule,
  MdOutlineClose,
} from "react-icons/md";
import { FaWhatsapp } from "react-icons/fa6";
import { Input } from "@/components/ui/Input";
import { buttonBase, buttonVariants } from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import { customerChatHref } from "@/utils/whatsapp";
import { fullDate } from "@/utils/format";
import { formatSlotDate as prettyDate } from "@/utils/consultation";
import { useDesignInquiries } from "@/components/client/admin/DesignInquiriesProvider";
import {
  updateInquiryStatus,
  updateInquirySettings,
} from "@/app/actions/inquiry-admin";
import type {
  AdminDesignInquiry,
  DesignInquiryStatus,
  DesignInquirySettings,
} from "@/utils/inquiry";

// ── Static maps ──────────────────────────────────────────────────────────────

const INQUIRY_STATUSES: DesignInquiryStatus[] = ["new", "reviewed", "closed"];

const STATUS_STYLES: Record<DesignInquiryStatus, string> = {
  new: "bg-[#7A9268]/15 text-[#4c623d]",
  reviewed: "bg-[#2C3829]/10 text-[#2C3829]",
  closed: "bg-red-50 text-red-600",
};

const STATUS_LABELS: Record<DesignInquiryStatus, string> = {
  new: "New",
  reviewed: "Reviewed",
  closed: "Closed",
};

const MODE_LABELS: Record<AdminDesignInquiry["mode"], string> = {
  individual: "Individual",
  group: "Group",
};

type StatusFilter = DesignInquiryStatus | "all";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "reviewed", label: "Reviewed" },
  { key: "closed", label: "Closed" },
];

/** Hides the native number-input up/down spinner arrows. */
const NO_SPINNER =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/**
 * Keep only URLs of a safe shape before rendering them into an <a href> / <Image
 * src>: a same-origin absolute path ("/…", not "//…") or an http(s) URL. Every
 * image_urls[i] is forgeable-by-design (anon can POST straight to PostgREST), so
 * we filter defensively at render time.
 */
function safeImageUrls(urls: unknown): string[] {
  if (!Array.isArray(urls)) return [];
  return urls.filter(
    (v): v is string =>
      typeof v === "string" &&
      ((v.startsWith("/") && !v.startsWith("//")) || /^https?:\/\//i.test(v)),
  );
}

// ── Component ────────────────────────────────────────────────────────────────

export default function DesignInquiriesClient({
  rows,
  settings,
  status,
  counts,
}: {
  rows: AdminDesignInquiry[];
  settings: DesignInquirySettings | null;
  status: StatusFilter;
  counts: Record<DesignInquiryStatus, number>;
}) {
  const router = useRouter();
  const { refresh } = useDesignInquiries();

  const [toast, setToast] = useState({ show: false, message: "", error: false });
  const showToast = (message: string, error = false) => {
    setToast({ show: true, message, error });
    setTimeout(() => setToast({ show: false, message: "", error: false }), 3500);
  };

  const [items, setItems] = useState<AdminDesignInquiry[]>(rows);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  // Reset the local (optimistic) list + collapse the open row whenever the server
  // rows change. Derived during render — no effect, no cascading rerender.
  const [prevRows, setPrevRows] = useState(rows);
  if (prevRows !== rows) {
    setPrevRows(rows);
    setItems(rows);
    setExpanded(null);
  }

  const total = counts.new + counts.reviewed + counts.closed;
  const countFor = (key: StatusFilter): number =>
    key === "all" ? total : counts[key];

  // ── Settings modal ─────────────────────────────────────────────────────────
  const [sheetOpen, setSheetOpen] = useState(false);
  const [leadDays, setLeadDays] = useState(
    String(settings?.delivery_lead_days ?? 7),
  );
  const [maxDays, setMaxDays] = useState(String(settings?.max_advance_days ?? 365));
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheetOpen]);

  const settingsError = useMemo<string | null>(() => {
    const lead = Number(leadDays);
    const max = Number(maxDays);
    if (!Number.isInteger(lead) || lead < 0 || lead > 365)
      return "Lead time must be between 0 and 365 days.";
    if (!Number.isInteger(max) || max < 1 || max > 730)
      return "Latest date must be between 1 and 730 days.";
    if (lead >= max) return "Earliest delivery must be before the latest date.";
    return null;
  }, [leadDays, maxDays]);

  const saveSettings = async () => {
    if (settingsError || savingSettings) return;
    setSavingSettings(true);
    const res = await updateInquirySettings({
      deliveryLeadDays: Number(leadDays),
      maxAdvanceDays: Number(maxDays),
    });
    setSavingSettings(false);
    if (res.ok) {
      showToast("Delivery settings saved.");
      setSheetOpen(false);
      router.refresh();
    } else {
      showToast(res.error, true);
    }
  };

  // ── Status change ──────────────────────────────────────────────────────────
  const changeStatus = async (
    inquiry: AdminDesignInquiry,
    next: DesignInquiryStatus,
  ) => {
    if (next === inquiry.status || busy.has(inquiry.id)) return;
    setBusy((p) => new Set(p).add(inquiry.id));

    setItems((prev) =>
      prev.map((r) => (r.id === inquiry.id ? { ...r, status: next } : r)),
    );

    const res = await updateInquiryStatus(inquiry.id, next);

    setBusy((p) => {
      const n = new Set(p);
      n.delete(inquiry.id);
      return n;
    });

    if (!res.ok) {
      setItems((prev) =>
        prev.map((r) =>
          r.id === inquiry.id ? { ...r, status: inquiry.status } : r,
        ),
      );
      showToast(res.error, true);
      return;
    }

    showToast(`Inquiry marked ${STATUS_LABELS[next]}.`);
    refresh();
    router.refresh();
  };

  return (
    <>
      <Toast show={toast.show} message={toast.message} error={toast.error} />

      {/* Header: settings trigger */}
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="hidden sm:block font-jost text-sm text-[#2C3829]/60">
          Triage design inquiries. Tune the customer delivery window in{" "}
          <span className="font-medium text-[#2C3829]">Delivery settings</span>.
        </p>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-[#d6c3b3]/60 bg-white px-4 py-2 text-sm font-jost font-medium text-[#2C3829] transition-colors hover:bg-[#d6c3b3]/15 sm:self-auto"
        >
          <MdOutlineSchedule className="text-lg" />
          Delivery settings
        </button>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto hide-scrollbar -mx-6 px-6 md:mx-0 md:px-0">
        {STATUS_TABS.map((t) => {
          const active = t.key === status;
          const c = countFor(t.key);
          const href =
            t.key === "all"
              ? "/admin/design-inquiries"
              : `/admin/design-inquiries?status=${t.key}`;
          return (
            <Link
              key={t.key}
              href={href}
              className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-jost font-medium transition-colors border ${
                active
                  ? "bg-[#2C3829] text-white border-[#2C3829]"
                  : "bg-white text-[#2C3829]/70 border-[#d6c3b3]/50 hover:bg-[#d6c3b3]/20"
              }`}
            >
              {t.label}
              {c > 0 && (
                <span
                  className={`min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-semibold flex items-center justify-center leading-none ${
                    active ? "bg-white/20 text-white" : "bg-[#7A9268]/15 text-[#4c623d]"
                  }`}
                >
                  {c > 99 ? "99+" : c}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* List */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-5 py-20 md:py-28 text-center">
          <div className="relative flex items-center justify-center">
            <span className="absolute inline-flex h-24 w-24 rounded-full bg-[#7A9268]/8" />
            <span className="relative flex items-center justify-center w-20 h-20 rounded-full bg-[#7A9268]/12 ring-1 ring-[#7A9268]/20 text-[#7A9268]">
              <MdOutlineDesignServices className="text-4xl" />
            </span>
          </div>
          <div className="space-y-2">
            <p className="cormorant text-2xl md:text-3xl text-primary-dark">
              No {status === "all" ? "" : `${status} `}inquiries
            </p>
            <p className="jost text-sm text-muted max-w-xs mx-auto leading-relaxed">
              Design inquiries from the storefront will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((q) => {
            const isOpen = expanded === q.id;
            const gallery = safeImageUrls(q.image_urls);
            return (
              <div
                key={q.id}
                className="rounded-2xl border border-[#d6c3b3]/40 bg-white overflow-hidden transition-shadow hover:shadow-sm"
              >
                {/* Collapsed row */}
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : q.id)}
                  aria-expanded={isOpen}
                  className="w-full flex items-start sm:items-center gap-3 p-4 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <span className="block font-jost font-semibold text-[#211a15] truncate">
                      {prettyDate(q.delivery_date)}
                    </span>
                    <span className="block text-[13px] text-[#2C3829]/70 truncate">
                      {q.name} · {MODE_LABELS[q.mode]}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`hidden sm:inline rounded-full px-2.5 py-0.5 text-[11px] font-jost font-medium ${STATUS_STYLES[q.status]}`}
                    >
                      {STATUS_LABELS[q.status]}
                    </span>
                    <MdOutlineExpandMore
                      className={`text-2xl text-[#2C3829]/50 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                    />
                  </div>
                </button>

                {/* Expanded */}
                {isOpen && (
                  <div className="border-t border-[#d6c3b3]/30 bg-[#FAF7F2] px-4 py-4 animate-in fade-in duration-300">
                    {/* Mobile status badge */}
                    <div className="sm:hidden mb-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-jost font-medium ${STATUS_STYLES[q.status]}`}
                      >
                        {STATUS_LABELS[q.status]}
                      </span>
                    </div>

                    {/* Meta grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-sm">
                      <Meta label="Reference" value={q.ref} />
                      <Meta label="Submitted" value={fullDate(q.created_at)} />
                      <Meta label="Delivery date" value={prettyDate(q.delivery_date)} />
                      <Meta label="Mode" value={MODE_LABELS[q.mode]} />
                    </div>

                    {/* Contact chips */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {q.email && (
                        <a
                          href={`mailto:${q.email}`}
                          className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#d6c3b3]/50 px-3 py-1.5 text-xs font-jost font-medium text-[#211a15] hover:bg-[#f0ebe3] transition-colors break-all"
                        >
                          <MdOutlineMailOutline className="text-sm shrink-0" />
                          {q.email}
                        </a>
                      )}
                      {q.phone && (
                        <>
                          <a
                            href={`tel:${q.phone}`}
                            className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#d6c3b3]/50 px-3 py-1.5 text-xs font-jost font-medium text-[#211a15] hover:bg-[#f0ebe3] transition-colors"
                          >
                            <MdOutlinePhone className="text-sm shrink-0" />
                            {q.phone}
                          </a>
                          <a
                            href={customerChatHref(
                              q.phone,
                              `Hi ${q.name || "there"}, this is ZIEA regarding your design inquiry ${q.ref}. `,
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-full bg-[#25D366]/10 border border-[#25D366]/30 px-3 py-1.5 text-xs font-jost font-medium text-[#1a7a44] hover:bg-[#25D366]/15 transition-colors"
                          >
                            <FaWhatsapp className="text-sm shrink-0" />
                            Message customer on WhatsApp
                          </a>
                        </>
                      )}
                    </div>

                    {/* Looking for (individual) */}
                    {q.mode === "individual" && q.garment && (
                      <div className="mb-4">
                        <span className="block text-[11px] uppercase tracking-wider text-[#2C3829]/45 mb-1">
                          Looking for
                        </span>
                        <p className="font-jost text-sm text-[#211a15]">{q.garment}</p>
                      </div>
                    )}

                    {/* Requirements (individual) / Theme (group) */}
                    {q.mode === "individual" && q.requirements && (
                      <div className="mb-4">
                        <span className="block text-[11px] uppercase tracking-wider text-[#2C3829]/45 mb-1">
                          Requirements
                        </span>
                        <p className="font-body-md text-[#211a15] leading-relaxed whitespace-pre-wrap break-words">
                          {q.requirements}
                        </p>
                      </div>
                    )}
                    {q.mode === "group" && q.theme && (
                      <div className="mb-4">
                        <span className="block text-[11px] uppercase tracking-wider text-[#2C3829]/45 mb-1">
                          Theme
                        </span>
                        <p className="font-body-md text-[#211a15] leading-relaxed whitespace-pre-wrap break-words">
                          {q.theme}
                        </p>
                      </div>
                    )}

                    {/* Sizing — individual */}
                    {q.mode === "individual" && q.bust_chest && (
                      <div className="mb-4">
                        <span className="block text-[11px] uppercase tracking-wider text-[#2C3829]/45 mb-1">
                          Sizing
                        </span>
                        <p className="font-jost text-sm text-[#211a15]">
                          Bust / chest: {q.bust_chest}
                          {q.size_unit ? ` ${q.size_unit}` : ""}
                        </p>
                      </div>
                    )}

                    {/* Sizing — group members table */}
                    {q.mode === "group" && q.members.length > 0 && (
                      <div className="mb-4">
                        <span className="block text-[11px] uppercase tracking-wider text-[#2C3829]/45 mb-1">
                          Members
                          {q.size_unit ? ` · sizes in ${q.size_unit}` : ""}
                        </span>
                        <div className="overflow-x-auto rounded-xl border border-[#d6c3b3]/40 bg-white">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-[11px] uppercase tracking-wider text-[#2C3829]/45">
                                <th className="px-3 py-2 font-jost font-medium">Name</th>
                                <th className="px-3 py-2 font-jost font-medium">
                                  Looking for
                                </th>
                                <th className="px-3 py-2 font-jost font-medium">
                                  Bust / chest
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {q.members.map((m, i) => (
                                <tr
                                  key={i}
                                  className="border-t border-[#d6c3b3]/30 text-[#211a15]"
                                >
                                  <td className="px-3 py-2 font-jost break-words">
                                    {m.name}
                                  </td>
                                  <td className="px-3 py-2 font-jost break-words">
                                    {m.garment}
                                  </td>
                                  <td className="px-3 py-2 font-jost">{m.bustChest}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Image gallery */}
                    {gallery.length > 0 && (
                      <div className="mb-4">
                        <span className="block text-[11px] uppercase tracking-wider text-[#2C3829]/45 mb-1">
                          Reference images
                        </span>
                        <div className="flex flex-wrap gap-3">
                          {gallery.map((url, i) => (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-2 group"
                            >
                              <span className="relative block h-20 w-20 overflow-hidden rounded-lg border border-[#d6c3b3]/50 bg-white">
                                <Image
                                  src={url}
                                  alt={`Design inquiry reference ${i + 1}`}
                                  fill
                                  sizes="80px"
                                  className="object-cover"
                                />
                              </span>
                            </a>
                          ))}
                        </div>
                        {q.image_note && (
                          <p className="mt-2 text-xs text-[#2C3829]/60 whitespace-pre-wrap break-words">
                            {q.image_note}
                          </p>
                        )}
                      </div>
                    )}

                    {gallery.length === 0 && q.image_note && (
                      <div className="mb-4">
                        <span className="block text-[11px] uppercase tracking-wider text-[#2C3829]/45 mb-1">
                          Image note
                        </span>
                        <p className="text-xs text-[#2C3829]/60 whitespace-pre-wrap break-words">
                          {q.image_note}
                        </p>
                      </div>
                    )}

                    {/* Status control */}
                    <div className="pt-3 border-t border-[#d6c3b3]/30">
                      <span className="block text-xs font-jost font-medium text-[#2C3829]/60 mb-2">
                        Update status
                      </span>
                      <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                        {INQUIRY_STATUSES.map((s) => {
                          const active = s === q.status;
                          return (
                            <button
                              key={s}
                              type="button"
                              disabled={active || busy.has(q.id)}
                              onClick={() => changeStatus(q, s)}
                              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-jost font-medium border transition-colors ${
                                active
                                  ? `${STATUS_STYLES[s]} border-transparent cursor-default`
                                  : "bg-white text-[#2C3829]/70 border-[#d6c3b3]/50 hover:bg-[#d6c3b3]/20 disabled:opacity-50"
                              }`}
                            >
                              {active ? `● ${STATUS_LABELS[s]}` : STATUS_LABELS[s]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delivery settings modal */}
      {sheetOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSheetOpen(false);
          }}
        >
          <div className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-3xl bg-white p-6">
            <div className="mb-1 flex items-start justify-between gap-4">
              <h2 className="font-jost text-lg font-semibold text-[#2C3829]">
                Delivery window
              </h2>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Close"
                className="shrink-0 rounded-full p-1 text-[#2C3829]/60 transition-colors hover:bg-[#d6c3b3]/20"
              >
                <MdOutlineClose className="text-xl" />
              </button>
            </div>
            <p className="font-jost text-sm text-[#2C3829]/60 mb-5">
              Controls the delivery dates customers can pick. Changes appear on the
              customer calendar promptly.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Earliest (days)"
                type="number"
                min={0}
                max={365}
                className={NO_SPINNER}
                value={leadDays}
                onChange={(e) => setLeadDays(e.target.value)}
              />
              <Input
                label="Latest (days)"
                type="number"
                min={1}
                max={730}
                className={NO_SPINNER}
                value={maxDays}
                onChange={(e) => setMaxDays(e.target.value)}
              />
            </div>

            {settingsError && (
              <p className="text-red-500 text-xs mt-3 font-jost">{settingsError}</p>
            )}

            {!settings && (
              <p className="text-amber-600 text-xs mt-3 font-jost">
                Design inquiry settings haven&apos;t been initialised yet. Saving may
                fail until a settings row exists.
              </p>
            )}

            <button
              type="button"
              onClick={saveSettings}
              disabled={!!settingsError || savingSettings}
              className={`${buttonBase} ${buttonVariants["auth-primary"]} mt-5 w-full disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {savingSettings ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wider text-[#2C3829]/45">
        {label}
      </span>
      <span className="font-jost font-medium text-[#211a15] break-words">
        {value}
      </span>
    </div>
  );
}
