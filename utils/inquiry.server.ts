// Server-only delivery-window read for the Design Inquiry feature. Split out of
// utils/inquiry.ts (which is client-imported for uuidV4/constants) because this
// uses next/cache. The rarely-changing SETTINGS row is cached (tag
// `design-inquiry-settings`, invalidated on admin save via updateInquirySettings);
// "today" and the derived window are recomputed FRESH per request so the calendar
// never freezes at a stale date. Same posture as utils/branding.server.ts.
import { unstable_cache } from "next/cache";

import { createPublicClient } from "@/utils/supabase/public";
import { istNowParts } from "@/utils/consultation";
import { addDaysISO } from "@/utils/inquiry";

/** Tag revalidated by updateInquirySettings so a lead/max change is picked up at once. */
export const INQUIRY_SETTINGS_TAG = "design-inquiry-settings";

/** Cached read of the single admin-editable settings row (just the two ints). */
const getInquirySettings = unstable_cache(
  async (): Promise<{ delivery_lead_days: number; max_advance_days: number } | null> => {
    const supabase = createPublicClient();
    const { data } = await supabase
      .from("design_inquiry_settings")
      .select("delivery_lead_days, max_advance_days")
      .limit(1)
      .maybeSingle<{ delivery_lead_days: number; max_advance_days: number }>();
    return data ?? null;
  },
  ["design-inquiry-settings"],
  { tags: [INQUIRY_SETTINGS_TAG], revalidate: 3600 },
);

/**
 * The bookable delivery-date window. Settings come from the data cache; "today"
 * and the window are computed live. Consumed by BOTH the customer page (to wire
 * the Calendar) and the server action (to re-check the forgeable client date):
 *  - todayISO:      IST today ("YYYY-MM-DD").
 *  - minISO:        earliest selectable = today + delivery_lead_days.
 *  - maxISO:        latest selectable  = today + max_advance_days.
 *  - leadDays:      the resolved lead days.
 *  - disabledDates: every ISO day from today up to (today + leadDays - 1)
 *                   inclusive, so the Calendar renders the lead-time gap disabled.
 *                   EMPTY when leadDays === 0.
 */
export async function getDeliveryWindow(): Promise<{
  todayISO: string;
  minISO: string;
  maxISO: string;
  leadDays: number;
  disabledDates: string[];
}> {
  const settings = await getInquirySettings();
  const leadDays = settings?.delivery_lead_days ?? 7;
  const maxAdvanceDays = settings?.max_advance_days ?? 365;

  const { dateISO: todayISO } = istNowParts();
  const minISO = addDaysISO(todayISO, leadDays);
  const maxISO = addDaysISO(todayISO, maxAdvanceDays);

  // [today .. today + leadDays - 1] inclusive; empty when leadDays === 0.
  const disabledDates: string[] = [];
  for (let i = 0; i < leadDays; i += 1) {
    disabledDates.push(addDaysISO(todayISO, i));
  }

  return { todayISO, minISO, maxISO, leadDays, disabledDates };
}
