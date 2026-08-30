// WhatsApp "click to chat" targets for the Customisation Studio landing CTAs.
// Reuses the single shared business number; each link pre-fills a contextual
// message so the customer's chat opens ready to send. No Business API needed.
import { WHATSAPP_ORDER_NUMBER } from "@/utils/whatsapp";

function wa(text: string): string {
  return `https://wa.me/${WHATSAPP_ORDER_NUMBER}?text=${encodeURIComponent(text)}`;
}

export const WA_CONSULTATION = wa(
  "Hi ZIEA, I'd like to book a designer consultation for a custom outfit.",
);
export const WA_INSPIRATION = wa(
  "Hi ZIEA, I have a design/inspiration I'd love to share for a custom outfit.",
);
export const WA_CUSTOMISE = wa(
  "Hi ZIEA, I'd like to customise a piece from your collection.",
);
