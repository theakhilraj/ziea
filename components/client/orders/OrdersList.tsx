"use client";

import Image from "next/image";
import Link from "next/link";
import { MdChevronRight } from "react-icons/md";
import { FaWhatsapp } from "react-icons/fa6";
import OrderStatusBadge from "@/components/server/orders/OrderStatusBadge";
import UnauthenticatedState from "@/components/client/shop/UnauthenticatedState";
import EmptyState from "@/components/client/shop/EmptyState";
import { orderKey, type CustomerOrder } from "@/utils/orders";
import { buildOrderMessage, WHATSAPP_ORDER_NUMBER } from "@/utils/whatsapp";
import { formatINR } from "@/utils/price";
import { shortDate } from "@/utils/format";

/** Re-open the WhatsApp chat for an existing order, ref included. */
function chatAboutOrder(order: CustomerOrder) {
  const items = order.items.map((i) => ({
    name: i.productName ?? "Item",
    code: i.productCode ?? "—",
    size: i.size ?? "—",
    quantity: i.quantity,
    unitPrice: i.unitPrice,
  }));
  const text = buildOrderMessage(items, order.orderNumber ?? undefined);
  window.open(
    `https://wa.me/${WHATSAPP_ORDER_NUMBER}?text=${encodeURIComponent(text)}`,
    "_blank",
    "noopener,noreferrer",
  );
}

export default function OrdersList({
  orders,
  signedIn,
}: {
  orders: CustomerOrder[];
  signedIn: boolean;
}) {
  // Not signed in → same two-button state as the cart/wishlist.
  if (!signedIn) {
    return (
      <div className="relative min-h-[50vh]">
        <UnauthenticatedState title="Orders" />
      </div>
    );
  }

  // Signed in, but no orders yet — same empty state as the cart/wishlist.
  if (orders.length === 0) {
    return (
      <div className="relative min-h-[50vh]">
        <EmptyState
          title="Orders"
          description="You haven't placed any orders yet. Explore our collections to find something you love."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl flex flex-col gap-5">
      {orders.map((order) => {
        const key = orderKey(order);
        const preview = order.items.slice(0, 4);
        const extra = order.items.length - preview.length;
        return (
          <div
            key={order.groupId}
            className="rounded-2xl bg-surface shadow-[0px_2px_16px_rgba(44,56,41,0.08)] overflow-hidden"
          >
            {/* Header row: number + date, status */}
            <div className="flex items-start justify-between gap-3 px-5 pt-5">
              <div>
                <p className="font-jost font-semibold text-text">
                  {order.orderNumber ?? "Order"}
                </p>
                <p className="mt-0.5 text-[13px] text-muted">
                  {shortDate(order.createdAt)} · {order.itemCount}{" "}
                  {order.itemCount === 1 ? "item" : "items"} · {formatINR(order.total)}
                </p>
              </div>
              <OrderStatusBadge status={order.status} />
            </div>

            {/* Thumbnails */}
            <div className="flex items-center gap-3 px-5 py-4">
              {preview.map((item) => (
                <div
                  key={item.id}
                  className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-background"
                >
                  <Image
                    src={item.image}
                    alt={item.productName ?? "Ordered item"}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                </div>
              ))}
              {extra > 0 && (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-background text-sm font-medium text-muted">
                  +{extra}
                </div>
              )}
              <p className="ml-1 line-clamp-2 text-sm text-text/80">
                {order.items.map((i) => i.productName).filter(Boolean).join(", ")}
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 border-t border-border/50 px-5 py-3">
              <Link
                href={`/orders/${encodeURIComponent(key)}`}
                className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-dark transition-colors"
              >
                View details
                <MdChevronRight className="text-lg" />
              </Link>
              <button
                type="button"
                onClick={() => chatAboutOrder(order)}
                className="ml-auto inline-flex items-center gap-2 rounded-full bg-[#25D366]/10 px-4 py-2 text-sm font-semibold text-[#128C4A] hover:bg-[#25D366]/20 transition-colors"
              >
                <FaWhatsapp className="text-base" />
                Chat on WhatsApp
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
