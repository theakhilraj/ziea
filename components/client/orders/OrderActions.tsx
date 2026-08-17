"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FaWhatsapp } from "react-icons/fa6";
import { MdOutlineShoppingBag, MdOutlineCancel } from "react-icons/md";
import Toast from "@/components/ui/Toast";
import ConfirmationModal from "@/components/ui/ConfirmationModal";
import { addToCart } from "@/app/actions/cart";
import { cancelOrder } from "@/app/actions/orders";
import { buildOrderMessage, WHATSAPP_ORDER_NUMBER } from "@/utils/whatsapp";
import type { CustomerOrder } from "@/utils/orders";

/**
 * Customer actions on an order: re-open the WhatsApp thread (ref included) and
 * re-add every still-available item to the cart. Reorder reuses the existing
 * addToCart server action, so stock/RLS rules apply exactly as on a fresh add.
 */
export default function OrderActions({ order }: { order: CustomerOrder }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [cancelling, startCancel] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toast, setToast] = useState({ show: false, message: "", error: false });

  // A customer may only cancel while the whole order is still awaiting confirmation.
  const canCancel = order.status === "Initiated";

  const flash = (message: string, error = false) => {
    setToast({ show: true, message, error });
    setTimeout(() => setToast({ show: false, message: "", error: false }), 1800);
  };

  const chat = () => {
    const items = order.items.map((i) => ({
      name: i.productName ?? "Item",
      code: i.productCode ?? "—",
      size: i.size ?? "—",
      quantity: i.quantity,
      unitPrice: i.unitPrice,
    }));
    window.open(
      `https://wa.me/${WHATSAPP_ORDER_NUMBER}?text=${encodeURIComponent(
        buildOrderMessage(items, order.orderNumber ?? undefined),
      )}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const reorder = () => {
    const items = order.items.filter((i) => i.productId);
    if (items.length === 0) {
      flash("These items are no longer available.", true);
      return;
    }
    startTransition(async () => {
      let added = 0;
      let failed = 0;
      for (const i of items) {
        const res = await addToCart(i.productId as string, i.size ?? null, i.quantity);
        if (res && "success" in res) added += 1;
        else failed += 1;
      }
      window.dispatchEvent(new Event("ziea:counts-changed"));
      if (added === 0) {
        flash("Couldn't add these items to your cart.", true);
        return;
      }
      flash(failed > 0 ? "Added available items to your cart" : "Added to your cart");
      router.push("/cart");
    });
  };

  const confirmCancel = () => {
    startCancel(async () => {
      const res = await cancelOrder(order.groupId);
      setConfirmOpen(false);
      if (res && "success" in res) {
        flash("Order cancelled");
        router.refresh();
      } else {
        flash("Couldn't cancel this order.", true);
      }
    });
  };

  return (
    <>
      <Toast show={toast.show} message={toast.message} error={toast.error} />
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={reorder}
          disabled={pending}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#2C3829] px-6 py-3.5 font-jost font-medium text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60"
        >
          <MdOutlineShoppingBag className="text-lg" />
          {pending ? "Adding…" : "Reorder"}
        </button>
        <button
          type="button"
          onClick={chat}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-[#25D366]/10 px-6 py-3.5 font-jost font-medium text-[#128C4A] transition-colors hover:bg-[#25D366]/20"
        >
          <FaWhatsapp className="text-lg" />
          Chat on WhatsApp
        </button>
      </div>

      {canCancel && (
        <div className="mt-3 text-center">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={cancelling}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-red-500 transition-colors hover:text-red-600 disabled:opacity-60"
          >
            <MdOutlineCancel className="text-base" />
            Cancel order
          </button>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmOpen}
        title="Cancel this order?"
        message="This will cancel all items in this order. You can't undo this — you'd need to place a new order."
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        icon={<MdOutlineCancel />}
        isLoading={cancelling}
        onConfirm={confirmCancel}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
