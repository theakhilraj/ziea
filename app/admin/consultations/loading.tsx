import React from "react";
import { Skeleton } from "@/components/ui/Skeleton";

/** Route-level loading UI mirroring the Consultations page layout, so navigating
 *  in shows the shell instantly instead of a blank content pause. */
export default function Loading() {
  return (
    <main className="pt-20 lg:pt-6 px-6 lg:px-10 max-w-7xl mx-auto pb-6 lg:pb-10 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 lg:gap-0 mb-6 border-b border-[#d6c3b3]/30 pb-5 lg:pb-6">
        <div>
          <Skeleton className="h-8 w-48 mb-3" />
          <Skeleton className="h-4 w-72" />
        </div>
      </div>

      {/* Primary tabs (Bookings / Availability) */}
      <div className="flex gap-2 mb-6">
        <Skeleton className="h-9 w-28 rounded-full" />
        <Skeleton className="h-9 w-28 rounded-full" />
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={`tab-${i}`} className="h-9 w-24 rounded-full" />
        ))}
      </div>

      {/* Rows */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={`row-${i}`} className="h-20 rounded-2xl" />
        ))}
      </div>
    </main>
  );
}
