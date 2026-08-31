"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  MdOutlineExpandMore,
  MdOutlineMailOutline,
  MdOutlinePhone,
  MdOutlineEventAvailable,
  MdOutlineEventBusy,
  MdOutlineDeleteOutline,
  MdOutlineWarningAmber,
  MdOutlineOpenInNew,
  MdOutlineVideocam,
  MdOutlineSchedule,
  MdOutlineClose,
} from "react-icons/md";
import { FaWhatsapp } from "react-icons/fa6";
import { Input } from "@/components/ui/Input";
import { Select, type SelectOption } from "@/components/ui/Select";
import { buttonBase, buttonVariants } from "@/components/ui/Button";
import Toast from "@/components/ui/Toast";
import { Calendar } from "@/components/ui/Calendar";
import ConfirmationModal from "@/components/ui/ConfirmationModal";
import { customerChatHref } from "@/utils/whatsapp";
import { fullDate } from "@/utils/format";
import {
  timeToMinutes,
  formatSlotDate as prettyDate,
  formatSlotTime as prettyTime,
} from "@/utils/consultation";
import type { ConsultationSettings } from "@/utils/consultation";
import { useConsultations } from "@/components/client/admin/ConsultationsProvider";
import {
  updateConsultationSettings,
  addDayOff,
  removeDayOff,
  updateConsultationStatus,
  type AdminConsultation,
  type ConsultationStatus,
} from "@/app/actions/consultation-admin";

// ── Static maps ──────────────────────────────────────────────────────────────

const CONSULTATION_STATUSES: ConsultationStatus[] = [
  "confirmed",
  "completed",
  "cancelled",
];

const STATUS_STYLES: Record<ConsultationStatus, string> = {
  confirmed: "bg-[#7A9268]/15 text-[#4c623d]",
  completed: "bg-[#2C3829]/10 text-[#2C3829]",
  cancelled: "bg-red-50 text-red-600",
};

const STATUS_LABELS: Record<ConsultationStatus, string> = {
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

const METHOD_LABELS: Record<AdminConsultation["method"], string> = {
  google_meet: "Google Meet",
  whatsapp_video: "WhatsApp Video",
};

type StatusFilter = ConsultationStatus | "all";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

// ── Date/time formatting (TZ-safe) ───────────────────────────────────────────

// Date/time display uses the shared formatters (imported above as prettyDate /
// prettyTime) so utils/consultation.ts is the single source of truth.

/** Hourly work-time options ("HH:00") with 12-hour labels for the Timings dropdowns. */
const TIME_OPTIONS: SelectOption[] = Array.from({ length: 24 }, (_, h) => {
  const value = `${String(h).padStart(2, "0")}:00`;
  return { value, label: prettyTime(value) };
});

/** Hides the native number-input up/down spinner arrows. */
const NO_SPINNER =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/** Normalise a Postgres TIME ("HH:MM:SS") to the "HH:MM" a time input wants. */
function toHHMM(t: string | undefined | null): string {
  if (!t) return "";
  const [h = "00", m = "00"] = t.split(":");
  return `${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
}

// ── Component ────────────────────────────────────────────────────────────────

interface DayOff {
  id: string;
  day: string;
  reason: string | null;
}

export default function ConsultationsClient({
  tab,
  settings,
  daysOff,
  bookedDateCounts,
  todayISO,
  maxISO,
  rows,
  status,
  counts,
}: {
  tab: "availability" | "bookings";
  settings: ConsultationSettings | null;
  daysOff: DayOff[];
  bookedDateCounts: Record<string, number>;
  todayISO: string;
  maxISO: string;
  rows: AdminConsultation[];
  status: StatusFilter;
  counts: Record<ConsultationStatus, number>;
}) {
  const router = useRouter();
  const { refresh } = useConsultations();

  const [toast, setToast] = useState({ show: false, message: "", error: false });
  const showToast = (message: string, error = false) => {
    setToast({ show: true, message, error });
    setTimeout(() => setToast({ show: false, message: "", error: false }), 3500);
  };

  return (
    <>
      <Toast show={toast.show} message={toast.message} error={toast.error} />

      {/* Primary tabs */}
      <div className="flex gap-2 mb-6">
        {[
          { key: "bookings" as const, label: "Bookings" },
          { key: "availability" as const, label: "Availability" },
        ].map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={`/admin/consultations?tab=${t.key}`}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-jost font-medium transition-colors border ${
                active
                  ? "bg-[#2C3829] text-white border-[#2C3829]"
                  : "bg-white text-[#2C3829]/70 border-[#d6c3b3]/50 hover:bg-[#d6c3b3]/20"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {tab === "availability" ? (
        <AvailabilityTab
          settings={settings}
          daysOff={daysOff}
          bookedDateCounts={bookedDateCounts}
          todayISO={todayISO}
          maxISO={maxISO}
          showToast={showToast}
          refresh={refresh}
          onChanged={() => router.refresh()}
        />
      ) : (
        <BookingsTab
          rows={rows}
          status={status}
          counts={counts}
          showToast={showToast}
          refresh={refresh}
          onChanged={() => router.refresh()}
        />
      )}
    </>
  );
}

// ── Availability tab ─────────────────────────────────────────────────────────

function AvailabilityTab({
  settings,
  daysOff,
  bookedDateCounts,
  todayISO,
  maxISO,
  showToast,
  refresh,
  onChanged,
}: {
  settings: ConsultationSettings | null;
  daysOff: DayOff[];
  bookedDateCounts: Record<string, number>;
  todayISO: string;
  maxISO: string;
  showToast: (m: string, e?: boolean) => void;
  refresh: () => void;
  onChanged: () => void;
}) {
  // Settings form state
  const [workStart, setWorkStart] = useState(toHHMM(settings?.work_start) || "09:00");
  const [workEnd, setWorkEnd] = useState(toHHMM(settings?.work_end) || "17:00");
  const [slotMinutes, setSlotMinutes] = useState(String(settings?.slot_minutes ?? 60));
  const [leadTimeHours, setLeadTimeHours] = useState(
    String(settings?.lead_time_hours ?? 2),
  );
  const [maxAdvanceDays, setMaxAdvanceDays] = useState(
    String(settings?.max_advance_days ?? 30),
  );
  const [savingSettings, setSavingSettings] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Lock background scroll while the Timings modal is open.
  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheetOpen]);

  // Client-side validation mirroring the server schema.
  const settingsError = useMemo<string | null>(() => {
    if (!/^\d{2}:\d{2}$/.test(workStart)) return "Start time must be in HH:MM format.";
    if (!/^\d{2}:\d{2}$/.test(workEnd)) return "End time must be in HH:MM format.";
    const slot = Number(slotMinutes);
    const lead = Number(leadTimeHours);
    const adv = Number(maxAdvanceDays);
    if (!Number.isInteger(slot) || slot < 15 || slot > 240)
      return "Slot length must be between 15 and 240 minutes.";
    if (!Number.isInteger(lead) || lead < 0 || lead > 168)
      return "Lead time must be between 0 and 168 hours.";
    if (!Number.isInteger(adv) || adv < 1 || adv > 365)
      return "Booking window must be between 1 and 365 days.";
    const span = timeToMinutes(workEnd) - timeToMinutes(workStart);
    if (span <= 0) return "End time must be after the start time.";
    if (slot > span) return "Slot length can't exceed the length of the working day.";
    return null;
  }, [workStart, workEnd, slotMinutes, leadTimeHours, maxAdvanceDays]);

  const saveSettings = async () => {
    if (settingsError || savingSettings) return;
    setSavingSettings(true);
    const res = await updateConsultationSettings({
      workStart,
      workEnd,
      slotMinutes: Number(slotMinutes),
      leadTimeHours: Number(leadTimeHours),
      maxAdvanceDays: Number(maxAdvanceDays),
    });
    setSavingSettings(false);
    if (res.ok) {
      showToast("Availability settings saved.");
      setSheetOpen(false);
      onChanged();
    } else {
      showToast(res.error, true);
    }
  };

  // Day-off manager state
  const [picked, setPicked] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [blocking, setBlocking] = useState(false);
  const [removingDay, setRemovingDay] = useState<string | null>(null);
  const [warnDate, setWarnDate] = useState<{ day: string; count: number } | null>(null);

  const blockedDays = useMemo(() => daysOff.map((d) => d.day), [daysOff]);
  const blockedSet = useMemo(() => new Set(blockedDays), [blockedDays]);

  const doBlock = async (day: string) => {
    setBlocking(true);
    const res = await addDayOff(day, reason.trim() || undefined);
    setBlocking(false);
    setWarnDate(null);
    if (res.ok) {
      showToast(`${prettyDate(day)} is now blocked.`);
      setPicked(null);
      setReason("");
      refresh();
      onChanged();
    } else {
      showToast(res.error, true);
    }
  };

  const handleBlock = () => {
    if (!picked || blocking) return;
    if (blockedSet.has(picked)) {
      showToast("That date is already blocked.");
      return;
    }
    const activeCount = bookedDateCounts[picked] ?? 0;
    if (activeCount > 0) {
      // Warn before blocking a day that already has active bookings.
      setWarnDate({ day: picked, count: activeCount });
      return;
    }
    doBlock(picked);
  };

  const handleRemove = async (day: string) => {
    setRemovingDay(day);
    const res = await removeDayOff(day);
    setRemovingDay(null);
    if (res.ok) {
      showToast(`${prettyDate(day)} is available again.`);
      refresh();
      onChanged();
    } else {
      showToast(res.error, true);
    }
  };

  const reasonByDay = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const d of daysOff) m[d.day] = d.reason;
    return m;
  }, [daysOff]);

  return (
    <div>
      {/* Header: block dates here, adjust timings in the sheet */}
      <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-jost text-sm text-[#2C3829]/60">
          Block dates to remove their availability. Adjust working hours &amp; slot
          timings in <span className="font-medium text-[#2C3829]">Timings</span>.
        </p>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="inline-flex shrink-0 items-center gap-2 self-start rounded-full border border-[#d6c3b3]/60 bg-white px-4 py-2 text-sm font-jost font-medium text-[#2C3829] transition-colors hover:bg-[#d6c3b3]/15 sm:self-auto"
        >
          <MdOutlineSchedule className="text-lg" />
          Timings
        </button>
      </div>

      {/* Calendar (left) + blocked dates (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calendar / block-a-date card */}
        <section className="rounded-2xl border border-[#d6c3b3]/40 bg-white p-5 lg:p-6">
          <h2 className="font-jost text-lg font-semibold text-[#2C3829] mb-1">
            Block a date
          </h2>
          <p className="font-jost text-sm text-[#2C3829]/60 mb-4">
            Pick a date to remove all its availability. Already-blocked dates are
            struck through.
          </p>

          <Calendar
            value={picked}
            onChange={setPicked}
            minISO={todayISO}
            maxISO={maxISO}
            disabledDates={blockedDays}
          />

          <div className="mt-4">
            <Input
              label="Reason (optional)"
              type="text"
              maxLength={200}
              placeholder="e.g. Public holiday"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <button
            type="button"
            onClick={handleBlock}
            disabled={!picked || blocking}
            className={`${buttonBase} ${buttonVariants["auth-primary"]} mt-4 disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <MdOutlineEventBusy className="text-lg mr-2" />
            {blocking
              ? "Blocking…"
              : picked
                ? `Block ${prettyDate(picked)}`
                : "Pick a date to block"}
          </button>
        </section>

        {/* Blocked dates card */}
        <section className="rounded-2xl border border-[#d6c3b3]/40 bg-white p-5 lg:p-6">
          <h2 className="font-jost text-lg font-semibold text-[#2C3829] mb-1">
            Blocked dates ({daysOff.length})
          </h2>
          <p className="font-jost text-sm text-[#2C3829]/60 mb-4">
            Days with zero availability. Removing one makes it bookable again.
          </p>

          {daysOff.length === 0 ? (
            <p className="font-jost text-sm text-[#2C3829]/50 italic">
              No days off — every date within the window is bookable.
            </p>
          ) : (
            <ul className="space-y-2 max-h-[26rem] overflow-y-auto hide-scrollbar">
              {daysOff.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center gap-3 rounded-xl bg-[#FAF7F2] border border-[#d6c3b3]/30 px-3 py-2.5"
                >
                  <MdOutlineEventBusy className="text-lg text-[#a9603f] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <span className="block font-jost text-sm font-medium text-[#211a15]">
                      {prettyDate(d.day)}
                      {(bookedDateCounts[d.day] ?? 0) > 0 && (
                        <span className="ml-2 text-[11px] font-normal text-amber-600">
                          {bookedDateCounts[d.day]} booking
                          {bookedDateCounts[d.day] === 1 ? "" : "s"}
                        </span>
                      )}
                    </span>
                    {reasonByDay[d.day] && (
                      <span className="block text-xs text-[#2C3829]/60 truncate">
                        {reasonByDay[d.day]}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(d.day)}
                    disabled={removingDay === d.day}
                    aria-label={`Remove day off ${prettyDate(d.day)}`}
                    className="shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-jost font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                  >
                    <MdOutlineDeleteOutline className="text-base" />
                    {removingDay === d.day ? "…" : "Remove"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Timings bottom sheet (mobile) / centered modal (desktop) */}
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
                Working hours &amp; timings
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
              Controls the slots customers can book. Changes appear on the customer
              calendar promptly.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Work start"
                value={workStart}
                onChange={setWorkStart}
                options={TIME_OPTIONS}
                allowNone={false}
              />
              <Select
                label="Work end"
                value={workEnd}
                onChange={setWorkEnd}
                options={TIME_OPTIONS}
                allowNone={false}
              />
              <Input
                label="Slot length (min)"
                type="number"
                min={15}
                max={240}
                className={NO_SPINNER}
                value={slotMinutes}
                onChange={(e) => setSlotMinutes(e.target.value)}
              />
              <Input
                label="Lead time (hrs)"
                type="number"
                min={0}
                max={168}
                className={NO_SPINNER}
                value={leadTimeHours}
                onChange={(e) => setLeadTimeHours(e.target.value)}
              />
              <Input
                label="Booking window (days)"
                type="number"
                min={1}
                max={365}
                className={NO_SPINNER}
                value={maxAdvanceDays}
                onChange={(e) => setMaxAdvanceDays(e.target.value)}
              />
            </div>

            {settingsError && (
              <p className="text-red-500 text-xs mt-3 font-jost">{settingsError}</p>
            )}

            {!settings && (
              <p className="text-amber-600 text-xs mt-3 font-jost">
                Consultation settings haven&apos;t been initialised yet. Saving may
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

      {/* Warning modal — blocking a day that has active bookings */}
      <ConfirmationModal
        isOpen={warnDate !== null}
        title="This day has bookings"
        message={
          warnDate
            ? `${warnDate.count} active booking${warnDate.count === 1 ? "" : "s"} exist on ${prettyDate(
                warnDate.day,
              )}. Blocking it stops NEW bookings but keeps the existing one${
                warnDate.count === 1 ? "" : "s"
              }. Block anyway?`
            : ""
        }
        confirmLabel="Block anyway"
        cancelLabel="Cancel"
        icon={<MdOutlineWarningAmber />}
        onConfirm={() => warnDate && doBlock(warnDate.day)}
        onCancel={() => setWarnDate(null)}
      />
    </div>
  );
}

// ── Bookings tab ─────────────────────────────────────────────────────────────

function BookingsTab({
  rows,
  status,
  counts,
  showToast,
  refresh,
  onChanged,
}: {
  rows: AdminConsultation[];
  status: StatusFilter;
  counts: Record<ConsultationStatus, number>;
  showToast: (m: string, e?: boolean) => void;
  refresh: () => void;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<AdminConsultation[]>(rows);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<string>>(new Set());

  // Reset the local (optimistic) list + collapse the open row whenever the
  // server rows change. Derived during render — no effect, no cascading rerender.
  const [prevRows, setPrevRows] = useState(rows);
  if (prevRows !== rows) {
    setPrevRows(rows);
    setItems(rows);
    setExpanded(null);
  }

  const total = counts.confirmed + counts.completed + counts.cancelled;
  const countFor = (key: StatusFilter): number =>
    key === "all" ? total : counts[key];

  const changeStatus = async (booking: AdminConsultation, next: ConsultationStatus) => {
    if (next === booking.status || busy.has(booking.id)) return;
    setBusy((p) => new Set(p).add(booking.id));

    // Optimistic: update the row's status in place; if a status filter is active
    // it will leave that tab on the next server refresh.
    setItems((prev) =>
      prev.map((r) => (r.id === booking.id ? { ...r, status: next } : r)),
    );

    const res = await updateConsultationStatus(booking.id, next);

    setBusy((p) => {
      const n = new Set(p);
      n.delete(booking.id);
      return n;
    });

    if (!res.ok) {
      // Revert on failure.
      setItems((prev) =>
        prev.map((r) => (r.id === booking.id ? { ...r, status: booking.status } : r)),
      );
      showToast(res.error, true);
      return;
    }

    showToast(
      next === "cancelled"
        ? "Booking cancelled — the slot is free again."
        : `Booking marked ${STATUS_LABELS[next]}.`,
    );
    refresh();
    onChanged();
  };

  return (
    <>
      {/* Status filter tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto hide-scrollbar -mx-6 px-6 md:mx-0 md:px-0">
        {STATUS_TABS.map((t) => {
          const active = t.key === status;
          const c = countFor(t.key);
          const href =
            t.key === "all"
              ? "/admin/consultations?tab=bookings"
              : `/admin/consultations?tab=bookings&status=${t.key}`;
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
              <MdOutlineEventAvailable className="text-4xl" />
            </span>
          </div>
          <div className="space-y-2">
            <p className="cormorant text-2xl md:text-3xl text-primary-dark">
              No {status === "all" ? "" : `${status} `}bookings
            </p>
            <p className="jost text-sm text-muted max-w-xs mx-auto leading-relaxed">
              Consultation bookings from the storefront will appear here.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((c) => {
            const isOpen = expanded === c.id;
            return (
              <div
                key={c.id}
                className="rounded-2xl border border-[#d6c3b3]/40 bg-white overflow-hidden transition-shadow hover:shadow-sm"
              >
                {/* Collapsed row */}
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : c.id)}
                  aria-expanded={isOpen}
                  className="w-full flex items-start sm:items-center gap-3 p-4 text-left"
                >
                  <div className="flex-1 min-w-0">
                    <span className="block font-jost font-semibold text-[#211a15] truncate">
                      {prettyDate(c.slot_date)} · {prettyTime(c.slot_time)}
                    </span>
                    <span className="block text-[13px] text-[#2C3829]/70 truncate">
                      {c.name} · {METHOD_LABELS[c.method]} · {c.slot_minutes} min
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`hidden sm:inline rounded-full px-2.5 py-0.5 text-[11px] font-jost font-medium ${STATUS_STYLES[c.status]}`}
                    >
                      {STATUS_LABELS[c.status]}
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
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-jost font-medium ${STATUS_STYLES[c.status]}`}
                      >
                        {STATUS_LABELS[c.status]}
                      </span>
                    </div>

                    {/* Meta grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-sm">
                      <Meta label="Reference" value={c.ref} />
                      <Meta label="Method" value={METHOD_LABELS[c.method]} />
                      <Meta label="Duration" value={`${c.slot_minutes} min`} />
                      <Meta label="Booked" value={fullDate(c.created_at)} />
                    </div>

                    {/* Contact chips */}
                    <div className="flex flex-wrap gap-2 mb-4">
                      {c.email && (
                        <a
                          href={`mailto:${c.email}`}
                          className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#d6c3b3]/50 px-3 py-1.5 text-xs font-jost font-medium text-[#211a15] hover:bg-[#f0ebe3] transition-colors break-all"
                        >
                          <MdOutlineMailOutline className="text-sm shrink-0" />
                          {c.email}
                        </a>
                      )}
                      {c.phone && (
                        <>
                          <a
                            href={`tel:${c.phone}`}
                            className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#d6c3b3]/50 px-3 py-1.5 text-xs font-jost font-medium text-[#211a15] hover:bg-[#f0ebe3] transition-colors"
                          >
                            <MdOutlinePhone className="text-sm shrink-0" />
                            {c.phone}
                          </a>
                          <a
                            href={customerChatHref(
                              c.phone,
                              `Hi ${c.name || "there"}, this is ZIEA regarding your design consultation on ${prettyDate(
                                c.slot_date,
                              )} at ${prettyTime(c.slot_time)} (${METHOD_LABELS[c.method]}). `,
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
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#d6c3b3]/50 px-3 py-1.5 text-xs font-jost font-medium text-[#211a15]">
                        <MdOutlineVideocam className="text-sm shrink-0" />
                        {METHOD_LABELS[c.method]}
                      </span>
                    </div>

                    {/* Notes */}
                    {c.notes && (
                      <div className="mb-4">
                        <span className="block text-[11px] uppercase tracking-wider text-[#2C3829]/45 mb-1">
                          Notes
                        </span>
                        <p className="font-body-md text-[#211a15] leading-relaxed whitespace-pre-wrap break-words">
                          {c.notes}
                        </p>
                      </div>
                    )}

                    {/* Reference image */}
                    {c.image_url && (
                      <div className="mb-4">
                        <span className="block text-[11px] uppercase tracking-wider text-[#2C3829]/45 mb-1">
                          Reference image
                        </span>
                        <a
                          href={c.image_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 group"
                        >
                          <span className="relative block h-20 w-20 overflow-hidden rounded-lg border border-[#d6c3b3]/50 bg-white">
                            <Image
                              src={c.image_url}
                              alt="Consultation reference"
                              fill
                              sizes="80px"
                              className="object-cover"
                            />
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-jost font-medium text-[#4c623d] group-hover:underline">
                            Open <MdOutlineOpenInNew className="text-sm" />
                          </span>
                        </a>
                        {c.image_note && (
                          <p className="mt-2 text-xs text-[#2C3829]/60 whitespace-pre-wrap break-words">
                            {c.image_note}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Status control */}
                    <div className="pt-3 border-t border-[#d6c3b3]/30">
                      <span className="block text-xs font-jost font-medium text-[#2C3829]/60 mb-2">
                        Update status
                      </span>
                      <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                        {CONSULTATION_STATUSES.map((s) => {
                          const active = s === c.status;
                          return (
                            <button
                              key={s}
                              type="button"
                              disabled={active || busy.has(c.id)}
                              onClick={() => changeStatus(c, s)}
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
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-wider text-[#2C3829]/45">{label}</span>
      <span className="font-jost font-medium text-[#211a15] break-words">{value}</span>
    </div>
  );
}
