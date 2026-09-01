"use client";

import { useMemo, useRef, useState } from "react";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";

export interface CalendarProps {
  /** Currently selected day as "YYYY-MM-DD", or null when nothing is chosen. */
  value: string | null;
  /** Called with the "YYYY-MM-DD" of a selectable day when the user picks it. */
  onChange: (iso: string) => void;
  /** Earliest selectable day, "YYYY-MM-DD" (e.g. IST today, or today + lead). */
  minISO: string;
  /** Latest selectable day, "YYYY-MM-DD" (e.g. IST today + window). */
  maxISO: string;
  /**
   * IST today as "YYYY-MM-DD", used to draw the "today" ring + set
   * aria-current="date". OPTIONAL — when omitted it defaults to `minISO`, so
   * callers where the earliest selectable day IS today (e.g. consultation)
   * behave exactly as before. Callers with a lead-time gap (e.g. inquiry, where
   * `minISO` = today + leadDays) pass the REAL today here so the ring lands on
   * the actual current day rather than the first selectable one.
   */
  todayISO?: string;
  /** Day-offs / blackout dates as "YYYY-MM-DD"; rendered disabled. */
  disabledDates?: string[];
  /** Extra classes on the outer wrapper. */
  className?: string;
}

// ── Timezone-safe date math ──────────────────────────────────────────────────
// We never build a Date from a bare "YYYY-MM-DD" and read local getters, since
// that can shift a day depending on the browser TZ. Instead we parse into
// integer y/m/d and, where a Date is unavoidable (weekday, month rollover), pin
// it to UTC noon so DST / offset jitter can never cross a day boundary.

interface Ymd {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

function parseISO(iso: string): Ymd {
  const [y = "0", m = "1", d = "1"] = iso.split("-");
  return { y: Number(y), m: Number(m), d: Number(d) };
}

function toISO({ y, m, d }: Ymd): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** UTC-noon Date for a y/m/d — safe to read UTC getters from. */
function utcNoon({ y, m, d }: Ymd): Date {
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/** Weekday index 0(Sun)-6(Sat) for a day, TZ-safe. */
function weekdayOf(ymd: Ymd): number {
  return utcNoon(ymd).getUTCDay();
}

/** Number of days in a (1-based) month. */
function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
}

/** Compare two ISO strings chronologically. Lexicographic works for zero-padded ISO. */
function cmpISO(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Add (possibly negative) months to a {y,m}, keeping day at 1. */
function addMonths(y: number, m: number, delta: number): { y: number; m: number } {
  const zeroBased = (m - 1) + delta;
  const ny = y + Math.floor(zeroBased / 12);
  const nm = ((zeroBased % 12) + 12) % 12;
  return { y: ny, m: nm + 1 };
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export function Calendar({
  value,
  onChange,
  minISO,
  maxISO,
  todayISO,
  disabledDates,
  className = "",
}: CalendarProps) {
  const disabledSet = useMemo(() => new Set(disabledDates ?? []), [disabledDates]);

  // The month currently on screen. Anchor to the selected day, else the min day.
  const initial = parseISO(value ?? minISO);
  const [view, setView] = useState<{ y: number; m: number }>({ y: initial.y, m: initial.m });

  // The day that owns roving tabindex / receives arrow-key focus.
  const [focusedISO, setFocusedISO] = useState<string>(value ?? minISO);

  const gridRef = useRef<HTMLDivElement>(null);

  const minYmd = parseISO(minISO);
  const maxYmd = parseISO(maxISO);
  const minMonthStart = toISO({ y: minYmd.y, m: minYmd.m, d: 1 });
  const maxMonthStart = toISO({ y: maxYmd.y, m: maxYmd.m, d: 1 });
  const viewMonthStart = toISO({ y: view.y, m: view.m, d: 1 });

  const canPrev = cmpISO(viewMonthStart, minMonthStart) > 0;
  const canNext = cmpISO(viewMonthStart, maxMonthStart) < 0;

  const isSelectable = (iso: string): boolean =>
    cmpISO(iso, minISO) >= 0 && cmpISO(iso, maxISO) <= 0 && !disabledSet.has(iso);

  const goMonth = (delta: number) => {
    setView((v) => addMonths(v.y, v.m, delta));
  };

  const selectableInMonth = (y: number, m: number): string[] => {
    const total = daysInMonth(y, m);
    const out: string[] = [];
    for (let d = 1; d <= total; d++) {
      const iso = toISO({ y, m, d });
      if (isSelectable(iso)) out.push(iso);
    }
    return out;
  };

  // Move focus to `iso`, flipping the visible month if needed, then focus the DOM
  // node. Respects the [minISO, maxISO] window (does not focus outside it).
  const moveFocus = (iso: string) => {
    if (cmpISO(iso, minISO) < 0 || cmpISO(iso, maxISO) > 0) return;
    const { y, m } = parseISO(iso);
    if (y !== view.y || m !== view.m) setView({ y, m });
    setFocusedISO(iso);
    // After a potential month switch, focus on the next frame.
    requestAnimationFrame(() => {
      gridRef.current
        ?.querySelector<HTMLButtonElement>(`button[data-iso="${iso}"]`)
        ?.focus();
    });
  };

  const shiftISO = (iso: string, days: number): string => {
    const base = utcNoon(parseISO(iso));
    base.setUTCDate(base.getUTCDate() + days);
    return toISO({ y: base.getUTCFullYear(), m: base.getUTCMonth() + 1, d: base.getUTCDate() });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, iso: string) => {
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        moveFocus(shiftISO(iso, -1));
        break;
      case "ArrowRight":
        e.preventDefault();
        moveFocus(shiftISO(iso, 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        moveFocus(shiftISO(iso, -7));
        break;
      case "ArrowDown":
        e.preventDefault();
        moveFocus(shiftISO(iso, 7));
        break;
      case "Home": {
        e.preventDefault();
        moveFocus(shiftISO(iso, -weekdayOf(parseISO(iso))));
        break;
      }
      case "End": {
        e.preventDefault();
        moveFocus(shiftISO(iso, 6 - weekdayOf(parseISO(iso))));
        break;
      }
      case "PageUp":
        e.preventDefault();
        goMonth(-1);
        break;
      case "PageDown":
        e.preventDefault();
        goMonth(1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        if (isSelectable(iso)) onChange(iso);
        break;
      default:
        break;
    }
  };

  // Build the 6-week grid: leading blanks for the first weekday, then the days.
  const total = daysInMonth(view.y, view.m);
  const lead = weekdayOf({ y: view.y, m: view.m, d: 1 });
  const cells: (string | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= total; d++) cells.push(toISO({ y: view.y, m: view.m, d }));

  // Choose the roving-tabindex day for THIS view: the focused day if it's in this
  // month + selectable, else the selected day, else the first selectable day.
  const monthSelectable = selectableInMonth(view.y, view.m);
  const focusedInView = (() => {
    const f = parseISO(focusedISO);
    return f.y === view.y && f.m === view.m && isSelectable(focusedISO);
  })();
  const rovingISO =
    focusedInView
      ? focusedISO
      : value && (() => { const s = parseISO(value); return s.y === view.y && s.m === view.m; })()
        ? value
        : monthSelectable[0] ?? null;

  return (
    <div className={`w-full font-jost text-primary-dark ${className}`}>
      {/* Month header + prev/next */}
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => goMonth(-1)}
          disabled={!canPrev}
          aria-label="Previous month"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-primary-dark transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <MdChevronLeft className="text-xl" />
        </button>

        <div aria-live="polite" className="cormorant text-lg tracking-wide text-primary-dark">
          {MONTH_NAMES[view.m - 1]} {view.y}
        </div>

        <button
          type="button"
          onClick={() => goMonth(1)}
          disabled={!canNext}
          aria-label="Next month"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-primary-dark transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <MdChevronRight className="text-xl" />
        </button>
      </div>

      {/* Weekday header */}
      <div className="mb-1 grid grid-cols-7" role="presentation">
        {WEEKDAYS.map((w) => (
          <div
            key={w}
            className="py-1 text-center font-jost text-[11px] font-medium uppercase tracking-[0.1em] text-muted"
          >
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div
        ref={gridRef}
        role="grid"
        aria-label={`${MONTH_NAMES[view.m - 1]} ${view.y}`}
        className="grid grid-cols-7 gap-1"
      >
        {cells.map((iso, i) => {
          if (iso === null) {
            return <div key={`blank-${i}`} role="presentation" aria-hidden="true" />;
          }

          const { d } = parseISO(iso);
          const selectable = isSelectable(iso);
          const selected = value === iso;
          // The "today" ring lands on `todayISO` when provided (a caller with a
          // lead-time gap), otherwise on `minISO` (the earliest selectable day
          // is today, e.g. consultation).
          const isToday = iso === (todayISO ?? minISO);
          const isRoving = iso === rovingISO;

          const fullLabel = utcNoon(parseISO(iso)).toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          });

          const base =
            "relative flex aspect-square w-full items-center justify-center rounded-full text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background";
          const state = selected
            ? "bg-[#2C3829] text-white font-medium"
            : selectable
              ? "text-primary-dark hover:bg-surface"
              : "text-muted/40 cursor-not-allowed line-through";

          return (
            <button
              key={iso}
              type="button"
              role="gridcell"
              data-iso={iso}
              tabIndex={isRoving ? 0 : -1}
              aria-label={fullLabel}
              aria-selected={selected}
              aria-disabled={!selectable}
              aria-current={isToday ? "date" : undefined}
              disabled={!selectable}
              onClick={() => selectable && onChange(iso)}
              onKeyDown={(e) => handleKeyDown(e, iso)}
              className={`${base} ${state}`}
            >
              {isToday && !selected && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-primary/50"
                />
              )}
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default Calendar;
