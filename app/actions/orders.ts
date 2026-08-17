"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { getUserId } from "@/utils/supabase/user";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cancel one of the current customer's orders. Scoped by user_id AND status
 * "Initiated", so a customer can only cancel their own, still-pending order —
 * mirrored by the RLS UPDATE policy as a second line of defence. `groupKey` is
 * the order's stable key (order_group_id, or the row id for legacy single rows).
 */
export async function cancelOrder(groupKey: string) {
  if (!UUID_RE.test(groupKey)) return { error: "invalid" as const };

  const userId = await getUserId();
  if (!userId) return { error: "unauthenticated" as const };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .update({ status: "Cancelled" })
    .eq("user_id", userId)
    .eq("status", "Initiated")
    .or(`order_group_id.eq.${groupKey},id.eq.${groupKey}`)
    .select("id");

  if (error) return { error: "failed" as const };
  if (!data || data.length === 0) return { error: "not_cancellable" as const };

  revalidatePath("/orders");
  revalidatePath(`/orders/${groupKey}`);
  return { success: true, cancelled: data.length };
}
