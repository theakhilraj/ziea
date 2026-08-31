"use client";

import { useId } from "react";

export interface TimeSlotsProps {
  /** Available slot start-times as raw 24h "HH:MM" strings. */
  slots: string[];
  /** Currently selected slot ("HH:MM"), or null. */
  value: string | null;
  /** Called with the raw "HH:MM" of the slot the user picks. */
  onChange: (t: string) => void;
  /** When true, renders shimmer placeholders instead of the grid. */
  loading?: boolean;
  /** Extra classes on the outer wrapper. */
  className?: string;
}

/** "17:00" -> "5:00 PM". Display only; the underlying value stays "HH:MM". */
function to12Hour(hhmm: string): string {
  const [h = "0", m = "00"] = hhmm.split(":");
  const hour = Number(h);
  const period = hour >= 12 ? "PM" : "AM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:${m} ${period}`;
}

export function TimeSlots({
  slots,
  value,
  onChange,
  loading = false,
  className = "",
}: TimeSlotsProps) {
  const labelId = useId();

  if (loading) {
    return (
      <div
        className={`grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 ${className}`}
        aria-busy="true"
        aria-live="polite"
        aria-label="Loading available times"
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-11 animate-pulse rounded-xl bg-surface"
            aria-hidden="true"
          />
        ))}
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <p
        className={`rounded-xl border border-border bg-surface/60 px-4 py-6 text-center font-jost text-sm text-muted ${className}`}
        role="status"
      >
        No times available — please pick another day.
      </p>
    );
  }

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      className={className}
    >
      <span id={labelId} className="sr-only">
        Available appointment times
      </span>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
        {slots.map((slot) => {
          const selected = value === slot;
          return (
            <button
              key={slot}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(slot)}
              className={`flex items-center justify-center rounded-xl border px-3 py-2.5 font-jost text-sm transition-all active:scale-[0.98] ${
                selected
                  ? "border-[#2C3829] bg-[#2C3829] font-medium text-white"
                  : "border-border bg-white text-primary-dark hover:border-primary/50 hover:bg-surface"
              }`}
            >
              {to12Hour(slot)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default TimeSlots;
