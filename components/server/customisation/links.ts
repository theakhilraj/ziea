// WhatsApp "click to chat" targets for the Customisation Studio landing CTAs.
// Reuses the single shared business number; each link pre-fills a contextual
// message so the customer's chat opens ready to send. No Business API needed.
import { WHATSAPP_ORDER_NUMBER } from "@/utils/whatsapp";

function wa(text: string): string {
  return `https://wa.me/${WHATSAPP_ORDER_NUMBER}?text=${encodeURIComponent(text)}`;
}

// Note: the Designer Consultation card routes to /customisation/consultation and
// the "Create from Inspiration" card routes to /customisation/inquiry (internal
// flows), so neither uses a WhatsApp link anymore.
export const WA_CUSTOMISE = wa(
  "Hi ZIEA, I'd like to customise a piece from your collection.",
);
