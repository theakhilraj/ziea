"use client";

import React, { useEffect, useState } from "react";
import { z } from "zod";
import { MdClose, MdLockOutline } from "react-icons/md";
import { createClient } from "@/utils/supabase/client";
import { QuantityStepper } from "@/components/ui/QuantityStepper";
import { Select } from "@/components/ui/Select";
import Toast from "@/components/ui/Toast";
import { orderHref, type OrderItem } from "@/utils/whatsapp";
import { newOrderGroup } from "@/utils/orders";
import type { ProductSize } from "@/types/product";

// Strict validation for the optional guest contact fields: empty is allowed,
// but anything entered must be a real-looking name / Indian mobile number.
const buyerSchema = z.object({
  name: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[A-Za-z][A-Za-z .'-]{1,59}$/.test(v), {
      message: "Enter a valid name (letters only, 2–60 characters).",
    }),
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || /^(?:\+?91[-\s]?)?[6-9]\d{9}$/.test(v.replace(/[\s-]/g, "")), {
      message: "Enter a valid 10-digit Indian mobile number.",
    }),
});

interface BuyNowModalProps {
  open: boolean;
  onClose: () => void;
  productId: string;
  productName: string;
  productCode: string;
  unitPrice: number;
  imageUrl: string;
  sizes: ProductSize[];
  initialSize: string;
  initialQuantity: number;
}

export default function BuyNowModal({
  open,
  onClose,
  productId,
  productName,
  productCode,
  unitPrice,
  imageUrl,
  sizes,
  initialSize,
  initialQuantity,
}: BuyNowModalProps) {
  const supabase = React.useMemo(() => createClient(), []);

  const [size, setSize] = useState(initialSize);
  const [quantity, setQuantity] = useState(initialQuantity);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [isMember, setIsMember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({});
  const [toast, setToast] = useState({ show: false, message: "", error: false });

  const inStockSizes = (sizes ?? []).filter((s) => s.quantity > 0);
  const selected = (sizes ?? []).find((s) => s.size === size) ?? null;
  const maxQty = selected ? Math.max(1, selected.quantity) : 1;
  const subtotal = unitPrice * quantity;

  // Reset + resolve identity each time the modal opens.
  useEffect(() => {
    if (!open) return;
    setSize(initialSize);
    setQuantity(initialQuantity);

    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active) return;
      if (user) {
        setUserId(user.id);
        const { data: profile } = await supabase
          .from("users")
          .select("first_name, last_name, phone")
          .eq("id", user.id)
          .maybeSingle();
        if (!active) return;
        if (profile) {
          setIsMember(true);
          setName(`${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim());
          setPhone(profile.phone ?? "");
        }
      } else {
        setUserId(null);
        setIsMember(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [open, initialSize, initialQuantity, supabase]);

  if (!open) return null;

  const item: OrderItem = {
    name: productName,
    code: productCode,
    size,
    quantity,
    unitPrice,
  };

  const handleConfirm = () => {
    if (submitting) return;

    // Validate the guest contact fields (members' details come from their
    // verified profile, so they're trusted and skipped).
    if (!isMember) {
      const result = buyerSchema.safeParse({ name, phone });
      if (!result.success) {
        const flat = result.error.flatten().fieldErrors;
        setErrors({ name: flat.name?.[0], phone: flat.phone?.[0] });
        return;
      }
    }
    setErrors({});
    setSubmitting(true);

    // A group id + order number even for a single item, so it appears as one
    // order in "My Orders" and shares the ref shown in the WhatsApp chat.
    const { orderGroupId, orderNumber } = newOrderGroup();

    // Record the order first (fire-and-forget) so the lead is never lost, then
    // open WhatsApp synchronously within the click gesture so it isn't blocked.
    void supabase
      .from("orders")
      .insert({
        user_id: userId,
        customer_name: name.trim() || null,
        customer_phone: phone.trim() || null,
        product_id: productId,
        product_code: productCode,
        product_name: productName,
        size,
        quantity,
        unit_price: unitPrice,
        subtotal,
        status: "Initiated",
        source: "buy_now",
        order_group_id: orderGroupId,
        order_number: orderNumber,
      })
      .then(() => {});

    void supabase
      .from("activity_logs")
      .insert({
        user_id: userId,
        type: "Customer Order",
        description: `${name.trim() || "A customer"} started a WhatsApp order for "${productName}" (Size ${size}, Qty ${quantity})`,
        metadata: { product_code: productCode, size, quantity, subtotal, source: "buy_now" },
      })
      .then(() => {});

    window.open(orderHref([item], orderNumber), "_blank", "noopener,noreferrer");

    setToast({ show: true, message: "Opening WhatsApp… your order is saved", error: false });
    setTimeout(() => {
      setToast({ show: false, message: "", error: false });
      setSubmitting(false);
      onClose();
    }, 1400);
  };

  return (
    <>
      <Toast show={toast.show} message={toast.message} error={toast.error} />

      {/* Overlay */}
      <div
        className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center"
        role="dialog"
        aria-modal="true"
        aria-label="Confirm your order"
      >
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={onClose}
        />

        {/* Panel — bottom sheet on mobile, centered dialog on desktop */}
        <div className="relative w-full sm:max-w-md bg-background rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 pb-[calc(2.25rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-6 animate-in slide-in-from-bottom sm:zoom-in-95 fade-in duration-300 max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <h3 className="cormorant text-2xl text-primary-dark">Confirm your order</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 rounded-full flex items-center justify-center text-[#2C3829]/60 hover:bg-[#2C3829]/5 transition-colors"
            >
              <MdClose className="text-xl" />
            </button>
          </div>

          {/* Product */}
          <div className="flex gap-4">
            <div className="relative w-20 h-24 shrink-0 overflow-hidden rounded-xl bg-muted/20">
              {imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imageUrl} alt={productName} className="absolute inset-0 h-full w-full object-cover" />
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-jost font-semibold text-[#211a15] leading-snug break-words">{productName}</p>
              <p className="text-xs text-[#2C3829]/60 mt-0.5">Code: {productCode}</p>
              <p className="text-sm text-[#2C3829] mt-1">₹{Math.round(unitPrice).toLocaleString("en-IN")} each</p>
            </div>
          </div>

          {/* Size + Quantity */}
          <div className="grid grid-cols-2 gap-4 mt-5">
            <div>
              <label className="block text-xs font-jost font-medium text-[#2C3829]/60 mb-2">Size</label>
              <Select
                label=""
                value={size}
                onChange={(v) => {
                  setSize(v);
                  setQuantity(1);
                }}
                options={inStockSizes.map((s) => ({ value: s.size, label: s.size }))}
                allowNone={false}
                placeholder="Select size"
              />
            </div>
            <div>
              <label className="block text-xs font-jost font-medium text-[#2C3829]/60 mb-2">Quantity</label>
              <QuantityStepper value={quantity} onChange={setQuantity} min={1} max={maxQty} />
            </div>
          </div>

          {/* Optional contact (guests) */}
          {!isMember && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
              <div>
                <label className="block text-xs font-jost font-medium text-[#2C3829]/60 mb-2">
                  Name <span className="text-[#2C3829]/40">(optional)</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors((p) => ({ ...p, name: undefined }));
                  }}
                  placeholder="Your name"
                  aria-invalid={!!errors.name}
                  className={`w-full h-11 rounded-xl border bg-white px-3 font-jost text-sm text-[#2C3829] outline-none transition-colors ${
                    errors.name ? "border-red-400 focus:border-red-500" : "border-[#d6c3b3] focus:border-primary"
                  }`}
                />
                {errors.name && <p className="mt-1 text-xs text-red-500">{errors.name}</p>}
              </div>
              <div>
                <label className="block text-xs font-jost font-medium text-[#2C3829]/60 mb-2">
                  Phone <span className="text-[#2C3829]/40">(optional)</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (errors.phone) setErrors((p) => ({ ...p, phone: undefined }));
                  }}
                  placeholder="+91 …"
                  aria-invalid={!!errors.phone}
                  className={`w-full h-11 rounded-xl border bg-white px-3 font-jost text-sm text-[#2C3829] outline-none transition-colors ${
                    errors.phone ? "border-red-400 focus:border-red-500" : "border-[#d6c3b3] focus:border-primary"
                  }`}
                />
                {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone}</p>}
              </div>
            </div>
          )}

          {/* Subtotal */}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-[#d6c3b3]/40">
            <span className="font-jost text-sm text-[#2C3829]/70">Subtotal</span>
            <span className="font-jost font-semibold text-lg text-[#211a15]">
              ₹{Math.round(subtotal).toLocaleString("en-IN")}
            </span>
          </div>

          {/* Reassurance */}
          <p className="flex items-start gap-2 mt-4 text-xs text-[#2C3829]/60 leading-relaxed">
            <MdLockOutline className="text-sm shrink-0 mt-0.5" />
            No payment now - you'll confirm the details &amp; payment with us on WhatsApp.
          </p>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-12 rounded-full border border-[#d6c3b3] font-jost font-medium text-[#2C3829] hover:bg-[#2C3829]/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting || !size}
              aria-label="Confirm order on WhatsApp"
              className="flex-[1.4] h-12 rounded-full bg-[#2C3829] text-white font-jost font-semibold flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.98] disabled:opacity-60 transition-all shadow-sm"
            >
              {submitting ? "Opening…" : "Confirm on WhatsApp"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
