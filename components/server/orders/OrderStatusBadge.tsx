// Presentational only (no "use client", no hooks) so it renders safely inside
// BOTH the client OrdersList and the server order-detail page. Maps an order's
// rolled-up status to a customer-friendly label + colour.
import type { OrderStatus } from "@/utils/orders";

const STATUS_META: Record<OrderStatus, { label: string; className: string; dot: string }> = {
  Initiated: {
    label: "Awaiting confirmation",
    className: "bg-amber-50 text-amber-700 ring-amber-200",
    dot: "bg-amber-500",
  },
  Confirmed: {
    label: "Confirmed",
    className: "bg-sky-50 text-sky-700 ring-sky-200",
    dot: "bg-sky-500",
  },
  Fulfilled: {
    label: "Fulfilled",
    className: "bg-primary/10 text-primary-dark ring-primary/30",
    dot: "bg-primary",
  },
  Cancelled: {
    label: "Cancelled",
    className: "bg-gray-100 text-gray-500 ring-gray-300",
    dot: "bg-gray-400",
  },
};

export function statusLabel(status: OrderStatus): string {
  return STATUS_META[status].label;
}

export default function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const meta = STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${meta.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}
