"use server";

import { createClient } from "@/utils/supabase/server";
import {
  buildInteractionSeries,
  buildSalesInvoiceAnalytics,
  type BarDatum,
  type InteractionRange,
  type SalesInvoiceRange,
} from "@/utils/analytics";
import { getAdminClaims } from "@/utils/admin/session";

/**
 * Fetch a paged interaction time-series for the admin Analytics trend chart.
 * Best-effort: on any failure it returns an empty series rather than throwing
 * to the client.
 */
export async function getInteractionSeries(
  range: InteractionRange,
  offset: number,
): Promise<{ bars: BarDatum[]; windowLabel: string }> {
  try {
    const supabase = await createClient();
    return await buildInteractionSeries(supabase, range, offset);
  } catch (err) {
    console.error("getInteractionSeries:", err);
    return { bars: [], windowLabel: "" };
  }
}

export async function getSalesInvoiceAnalytics(range: SalesInvoiceRange, selectedMonth?: string) {
  if (!["all_time", "this_month", "last_3_months"].includes(range)) {
    throw new Error("Invalid sales analytics range.");
  }
  if (selectedMonth && !/^\d{4}-(0[1-9]|1[0-2])$/.test(selectedMonth)) {
    throw new Error("A valid month is required for sales invoice analytics.");
  }
  const claims = await getAdminClaims();
  if (!claims || claims.role !== "Admin") throw new Error("Unauthorized.");
  const supabase = await createClient();
  return buildSalesInvoiceAnalytics(supabase, range, selectedMonth);
}
