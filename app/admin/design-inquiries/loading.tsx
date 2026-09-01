import React from "react";
import { Skeleton } from "@/components/ui/Skeleton";

/** Route-level loading UI mirroring the Design Inquiries page layout, so
 *  navigating in shows the shell instantly instead of a blank content pause. */
export default function Loading() {
  return (
    <main className="pt-20 lg:pt-6 px-6 lg:px-10 max-w-7xl mx-auto pb-6 lg:pb-10 min-h-screen">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 lg:gap-0 mb-4 border-b border-[#d6c3b3]/30 pb-4 lg:pb-4">
        <div>
          <Skeleton className="h-8 w-52 mb-2" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>

      {/* Settings trigger */}
      <Skeleton className="h-10 w-40 rounded-full mb-4" />

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
