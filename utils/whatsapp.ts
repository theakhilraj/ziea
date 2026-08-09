// Shared WhatsApp "click to chat" order builder. Used by Buy Now (single item)
// and, later, the cart checkout (multiple items) so the message format stays
// identical. No Business API — just a wa.me link with a pre-filled ?text=.
import { rupees } from "@/utils/format";

/** The business number that receives orders (same as the Footer contact line). */
export const WHATSAPP_ORDER_NUMBER = "918301027765";

export interface OrderItem {
  name: string;
  code: string;
  size: string;
  quantity: number;
  unitPrice: number;
}

export function orderSubtotal(items: OrderItem[]): number {
  return items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
}

/**
 * Build the pre-filled WhatsApp order message. One bullet per line item; a
 * subtotal line only when there is more than one item (a single Buy Now already
 * shows its own price).
 */
export function buildOrderMessage(items: OrderItem[]): string {
  const lines = items.map(
    (i) =>
      `• ${i.name} (Code: ${i.code}) - Size ${i.size}, Qty ${i.quantity} - ${rupees(
        i.unitPrice * i.quantity,
      )}`,
  );

  const parts = ["Hi ZIEA, I'd like to place an order:", "", ...lines];

  if (items.length > 1) {
    parts.push("", `Subtotal: ${rupees(orderSubtotal(items))}`);
  }

  parts.push("", "Please confirm availability & payment. Thank you!");
  return parts.join("\n");
}

/** wa.me link with the order message pre-filled (to the business number). */
export function orderHref(items: OrderItem[]): string {
  return `https://wa.me/${WHATSAPP_ORDER_NUMBER}?text=${encodeURIComponent(
    buildOrderMessage(items),
  )}`;
}

/** Normalize an Indian phone into wa.me digits (adds the 91 country code). */
export function normalizeWaNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits; // already has a country code (e.g. 12 digits starting 91)
}

/** wa.me link to chat with a CUSTOMER on their own number (used by admin). */
export function customerChatHref(phone: string, text?: string): string {
  const num = normalizeWaNumber(phone);
  return text ? `https://wa.me/${num}?text=${encodeURIComponent(text)}` : `https://wa.me/${num}`;
}
