"use client";

import { useEffect, useRef, useState } from "react";
import { MdCalendarToday } from "react-icons/md";
import { Calendar } from "@/components/ui/Calendar";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const formatDate = (iso: string) => {
  const [year, month, day] = iso.split("-");
  return `${day}-${MONTHS[Number(month) - 1]}-${year}`;
};

export function InvoiceDatePicker({
  label,
  value,
  onChange,
  minISO,
  maxISO,
  todayISO,
  placeholder = "Select date",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minISO: string;
  maxISO: string;
  todayISO: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  return (
    <div className="relative" ref={rootRef}>
      <label className="mb-1 block font-jost text-sm font-medium text-[#2C3829]">{label}</label>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-center justify-between rounded-xl border border-[#d6c3b3] bg-white px-4 py-3 text-left font-jost text-base font-normal text-[#2C3829] outline-none transition-all hover:border-primary/50 focus:border-primary focus:ring-4 focus:ring-primary/5"
      >
        <span className={value ? "text-[#2C3829]" : "text-[#2C3829]/50"}>
          {value ? formatDate(value) : placeholder}
        </span>
        <MdCalendarToday className="shrink-0 text-lg text-[#2C3829]/50" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={label}
          className="absolute z-50 mt-2 w-[300px] max-w-[90vw] rounded-xl border border-[#d6c3b3]/50 bg-white p-3 shadow-lg shadow-black/5"
        >
          <Calendar
            value={value || null}
            onChange={(date) => {
              onChange(date);
              setOpen(false);
            }}
            minISO={minISO}
            maxISO={maxISO}
            todayISO={todayISO}
          />
        </div>
      )}
    </div>
  );
}
