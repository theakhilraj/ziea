"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { buildOrderMessage, WHATSAPP_ORDER_NUMBER, type OrderItem } from "@/utils/whatsapp";
import { newOrderGroup } from "@/utils/orders";
import Toast from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import type { ListItem } from "./ListManager";

/**
 * Cart checkout → WhatsApp. The cart page is already the review, so this goes
 * straight to WhatsApp with all line items + subtotal pre-filled, and records
 * each line as an order (source "cart") in the background. The customer is
 * signed in (cart requires auth), so their details come from their profile.
 */
export default function CartCheckoutButton({ items }: { items: ListItem[] }) {
  const supabase = createClient();
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", error: false });

  const handleCheckout = () => {
    if (submitting || items.length === 0) return;
    setSubmitting(true);

    const orderItems: OrderItem[] = items.map((i) => ({
      name: i.title,
      code: i.productCode,
      size: i.size ?? "—",
      quantity: i.quantity ?? 1,
      unitPrice: i.priceValue,
    }));

    // One group id + order number for the whole checkout, so all line items read
    // back as a single order in "My Orders" and the ref is shared in the chat.
    const { orderGroupId, orderNumber } = newOrderGroup();

    // Open WhatsApp synchronously within the click gesture (the message only
    // needs the product data), so the popup isn't blocked.
    const href = `https://wa.me/${WHATSAPP_ORDER_NUMBER}?text=${encodeURIComponent(
      buildOrderMessage(orderItems, orderNumber),
    )}`;
    window.open(href, "_blank", "noopener,noreferrer");

    // Record the order in the background — never blocks the redirect.
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        let name = "";
        let phone = "";
        const userId = user?.id ?? null;
        if (user) {
          const { data: prof } = await supabase
            .from("users")
            .select("first_name, last_name, phone")
            .eq("id", user.id)
            .maybeSingle();
          name = `${prof?.first_name ?? ""} ${prof?.last_name ?? ""}`.trim();
          phone = prof?.phone ?? "";
        }

        const rows = items.map((i) => ({
          user_id: userId,
          customer_name: name || null,
          customer_phone: phone || null,
          product_id: i.productId,
          product_code: i.productCode,
          product_name: i.title,
          size: i.size ?? null,
          quantity: i.quantity ?? 1,
          unit_price: i.priceValue,
          subtotal: i.priceValue * (i.quantity ?? 1),
          status: "Initiated",
          source: "cart",
          order_group_id: orderGroupId,
          order_number: orderNumber,
        }));
        await supabase.from("orders").insert(rows);
        await supabase.from("activity_logs").insert({
          user_id: userId,
          type: "Customer Order",
          description: `${name || "A customer"} started a WhatsApp cart order (${items.length} item${items.length > 1 ? "s" : ""})`,
          metadata: { source: "cart", items: items.length },
        });
      } catch {
        // Recording must never block the WhatsApp handoff.
      }
    })();

    setToast({ show: true, message: "Opening WhatsApp… your order is saved", error: false });
    setTimeout(() => {
      setToast({ show: false, message: "", error: false });
      setSubmitting(false);
    }, 1600);
  };

  return (
    <>
      <Toast show={toast.show} message={toast.message} error={toast.error} />
      <Button
        type="button"
        variant="auth-primary"
        onClick={handleCheckout}
        disabled={submitting}
        className="!text-base disabled:opacity-60"
      >
        {submitting ? "Opening WhatsApp…" : "Proceed to Checkout"}
      </Button>
    </>
  );
}
