"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import { Card } from "@/components/ui/Card";
import { BarChart } from "@/components/ui/BarChart";
import type { SalesInvoiceAnalytics as SalesInvoiceAnalyticsData, SalesInvoiceRange } from "@/utils/analytics";
import { getSalesInvoiceAnalytics } from "@/app/actions/analytics";

const RANGES: { value: SalesInvoiceRange; label: string }[] = [
  { value: "all_time", label: "All time" },
  { value: "this_month", label: "This month" },
  { value: "last_3_months", label: "Last 3 months" },
];

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});
const compactInr = new Intl.NumberFormat("en-IN", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function SalesInvoiceAnalytics({ initial }: { initial: SalesInvoiceAnalyticsData }) {
  const [data, setData] = useState(initial);
  const [selectedMonth, setSelectedMonth] = useState(initial.selectedMonth);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const selectRange = (range: SalesInvoiceRange) => {
    if (range === data.range) return;
    setError("");
    startTransition(async () => {
      try {
        const nextData = await getSalesInvoiceAnalytics(range, selectedMonth);
        setData(nextData);
        setSelectedMonth(nextData.selectedMonth);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load sales analytics.");
      }
    });
  };

  const selectMonth = (month: string) => {
    setSelectedMonth(month);
    setError("");
    startTransition(async () => {
      try {
        const nextData = await getSalesInvoiceAnalytics(data.range, month);
        setData(nextData);
        setSelectedMonth(nextData.selectedMonth);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not load sales analytics.");
      }
    });
  };

  const shiftMonth = (offset: number) => {
    const [year, month] = selectedMonth.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1 + offset, 1));
    selectMonth(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  };
  const currentMonth = initial.selectedMonth;
  const pagerMonthLabel = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    month: "short",
    year: "numeric",
  }).format(new Date(`${selectedMonth}-01T00:00:00Z`));

  const stats = [
    { label: "Invoices", value: data.invoiceCount.toLocaleString("en-IN") },
    { label: "Business invoiced", value: inr.format(data.invoiced) },
    { label: "Payments received", value: inr.format(data.collected) },
    { label: "Outstanding", value: inr.format(data.outstanding) },
  ];

  return (
    <Card className="p-5 sm:p-6 lg:p-8 mb-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-jost font-semibold text-[#2C3829]">Sales Invoices</h2>
          <p className="text-sm text-[#2C3829]/60">Issued business, payments received, and outstanding balances.</p>
        </div>
        <Link href="/admin/sales-invoices" className="text-sm text-[#4c623d] hover:underline">
          View invoices &rarr;
        </Link>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="min-w-0 rounded-xl border border-[#d6c3b3]/30 bg-[#FAF7F2]/60 p-3 sm:p-4">
            <p className="text-xs text-[#2C3829]/60">{stat.label}</p>
            <p className="mt-1 break-words font-jost text-lg font-semibold text-[#2C3829] sm:text-xl">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[#d6c3b3]/25 pt-5">
        <div className="flex w-full gap-1 overflow-x-auto rounded-full bg-[#f9ebe1] p-1 sm:w-auto">
          {RANGES.map((range) => (
            <button
              key={range.value}
              type="button"
              aria-pressed={range.value === data.range}
              disabled={isPending}
              onClick={() => selectRange(range.value)}
              className={`flex-1 rounded-full px-3 py-2 text-center text-xs font-medium transition-colors sm:flex-none sm:px-4 sm:text-sm ${
                range.value === data.range
                  ? "bg-white text-[#2C3829] shadow-sm"
                  : "text-[#2C3829]/60 hover:text-[#2C3829]"
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
        <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-normal">
          <button
            type="button"
            aria-label="Previous month"
            disabled={isPending}
            onClick={() => shiftMonth(-1)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d6c3b3]/30 text-[#2C3829] transition-colors hover:bg-[#FAF7F2] disabled:opacity-40"
          >
            <MdChevronLeft className="text-xl" />
          </button>
          <span className="min-w-0 flex-1 text-center font-jost text-sm text-[#2C3829] sm:min-w-[9rem] sm:flex-none">
            {pagerMonthLabel}
          </span>
          <button
            type="button"
            aria-label="Next month"
            disabled={isPending || selectedMonth >= currentMonth}
            onClick={() => shiftMonth(1)}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#d6c3b3]/30 text-[#2C3829] transition-colors ${
              selectedMonth < currentMonth
                ? "hover:bg-[#FAF7F2]"
                : "cursor-not-allowed opacity-40"
            }`}
          >
            <MdChevronRight className="text-xl" />
          </button>
        </div>
        <div className="flex items-center gap-4 text-xs text-[#2C3829]/60">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#2C3829]" /> Invoiced</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#A8BC9A]" /> Collected</span>
        </div>
      </div>

      {error ? (
        <p role="alert" className="py-12 text-center text-sm text-red-600">{error}</p>
      ) : data.buckets.length === 0 ? (
        <p className="py-12 text-center text-sm text-[#2C3829]/50">No issued invoices in this period.</p>
      ) : (
        <div className={`mt-6 w-full overflow-hidden transition-opacity ${isPending ? "opacity-40" : ""}`}>
          <BarChart
            data={data.buckets.map((bucket) => ({
              label: bucket.label,
              value: bucket.invoiced,
              secondaryValue: bucket.collected,
            }))}
            formatValue={(value) => `₹${compactInr.format(value)}`}
            className="w-full"
          />
        </div>
      )}
      <p className="mt-3 text-xs text-[#2C3829]/45">
        Last 3 months shows a month-by-month breakdown. Collected amounts are grouped by invoice issue date.
      </p>
    </Card>
  );
}
