import React from "react";
import type { BarDatum } from "@/utils/analytics";

interface BarChartProps {
  data: (BarDatum & { secondaryValue?: number })[];
  highlightLabel?: string;
  className?: string;
  formatValue?: (value: number) => string;
}

/**
 * Presentational vertical bar chart. Heights are normalised against the max
 * value; the highlighted bar (or, absent an explicit `highlightLabel`, the
 * tallest one) is drawn in deep forest, the rest in a sage tint.
 */
export function BarChart({ data, highlightLabel, className = "", formatValue = String }: BarChartProps) {
  if (!data || data.length === 0) {
    return (
      <div
        className={`h-48 sm:h-64 flex items-center justify-center text-[#2C3829]/50 font-jost text-sm ${className}`}
      >
        No data yet
      </div>
    );
  }

  const hasSecondarySeries = data.some((d) => d.secondaryValue !== undefined);
  const values = data.flatMap((d) => d.secondaryValue === undefined ? [d.value] : [d.value, d.secondaryValue]);
  const max = Math.max(...values, 1);

  // Resolve which bar to emphasise: explicit label if present in the data,
  // otherwise the tallest bar.
  const highlighted =
    highlightLabel && data.some((d) => d.label === highlightLabel)
      ? highlightLabel
      : data.reduce((best, datum) =>
          Math.max(datum.value, datum.secondaryValue ?? 0) >
          Math.max(best.value, best.secondaryValue ?? 0)
            ? datum
            : best,
        data[0]).label;

  const ariaSummary = data
    .map((d) => `${d.label}: ${formatValue(d.value)}${d.secondaryValue === undefined ? "" : `, collected ${formatValue(d.secondaryValue)}`}`)
    .join(", ");

  return (
    <div
      className={className}
      role="img"
      aria-label={`Bar chart. ${ariaSummary}.`}
    >
      <div className="h-48 sm:h-64 flex items-end gap-2 sm:gap-3">
        {data.map((d, i) => {
          const isHi = d.label === highlighted;
          const heightPct = (d.value / max) * 100;
          const secondaryHeightPct = ((d.secondaryValue ?? 0) / max) * 100;
          return (
            <div
              key={`${d.label}-${i}`}
              className="group flex-1 flex flex-col justify-end items-center h-full min-w-0 gap-1.5"
            >
              {hasSecondarySeries ? (
                <div className="flex h-full w-full items-end justify-center gap-1">
                  <div
                    title={`Invoiced: ${formatValue(d.value)}`}
                    className="w-[40%] max-w-10 rounded-t-md bg-[#2C3829] transition-[height] duration-300"
                    style={{ height: `${heightPct}%`, minHeight: d.value > 0 ? "4px" : "0" }}
                  />
                  <div
                    title={`Collected: ${formatValue(d.secondaryValue ?? 0)}`}
                    className="w-[40%] max-w-10 rounded-t-md bg-[#A8BC9A] transition-[height] duration-300"
                    style={{ height: `${secondaryHeightPct}%`, minHeight: (d.secondaryValue ?? 0) > 0 ? "4px" : "0" }}
                  />
                </div>
              ) : (
                <>
                  <span
                    className={`font-jost text-xs leading-none ${
                      isHi
                        ? "font-bold text-[#2C3829]"
                        : d.value > 0
                          ? "text-[#2C3829]/70"
                          : "text-[#2C3829]/30"
                    }`}
                  >
                    {formatValue(d.value)}
                  </span>
                  <div
                    className={`w-full rounded-t-lg origin-bottom animate-[barGrowIn_0.5s_ease-out_both] transition-colors group-hover:opacity-90 ${
                      isHi ? "bg-[#2C3829]" : "bg-[#A8BC9A] group-hover:bg-[#8aa27a]"
                    }`}
                    style={{
                      height: `${heightPct}%`,
                      minHeight: d.value > 0 ? "4px" : "0",
                      animationDelay: `${i * 60}ms`,
                    }}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex gap-2 sm:gap-3">
        {data.map((d, i) => {
          const isHi = d.label === highlighted;
          return (
            <div
              key={`${d.label}-label-${i}`}
              className="flex-1 min-w-0 flex flex-col items-center leading-tight"
            >
              <span
                className={`text-[10px] sm:text-xs uppercase tracking-wide ${
                  isHi ? "font-semibold text-[#2C3829]" : "text-[#2C3829]/60"
                }`}
              >
                {d.label}
              </span>
              {d.subLabel && (
                <span
                  className={`text-[10px] sm:text-xs mt-0.5 ${
                    isHi ? "text-[#2C3829]/80" : "text-[#2C3829]/40"
                  }`}
                >
                  {d.subLabel}
                </span>
              )}
              {hasSecondarySeries && (
                <div className="mt-2 flex flex-col items-center gap-0.5 whitespace-nowrap text-[10px] font-medium leading-tight sm:text-xs">
                  <span className="text-[#2C3829]/80">{formatValue(d.value)}</span>
                  <span className="text-[#718765]">{formatValue(d.secondaryValue ?? 0)}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
