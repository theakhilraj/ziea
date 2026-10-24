"use client";

import { useId, useRef, useState } from "react";
import { MdKeyboardArrowDown } from "react-icons/md";
import type { BillingProduct } from "@/utils/billing";

const CONTROL =
  "h-10 w-full rounded-lg border border-[#d6c3b3] bg-white px-3 font-jost text-sm text-[#2C3829] outline-none transition-colors hover:border-primary/50 focus:border-primary focus:ring-2 focus:ring-primary/10";

export function InvoiceProductPicker({
  value,
  products,
  onType,
  onPick,
}: {
  value: string;
  products: BillingProduct[];
  onType: (name: string) => void;
  onPick: (product: BillingProduct) => void;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const query = value.trim().toLowerCase();
  const filtered = (query
    ? products.filter((product) => product.name.toLowerCase().includes(query))
    : products
  ).slice(0, 30);

  return (
    <div
      className="relative"
      ref={rootRef}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <input
        value={value}
        placeholder="Product name"
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-label="Product or custom description"
        aria-expanded={open}
        aria-controls={listId}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onType(event.target.value);
          setOpen(true);
        }}
        className={`${CONTROL} pr-8`}
      />
      <MdKeyboardArrowDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[#2C3829]/50" />
      {open && filtered.length > 0 && (
        <div id={listId} className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-[#d6c3b3]/50 bg-white py-1 shadow-lg shadow-black/5">
          {filtered.map((product) => (
            <button
              type="button"
              key={product.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onPick(product);
                setOpen(false);
              }}
              className="flex w-full justify-between gap-2 px-3 py-2 text-left text-sm text-[#2C3829] hover:bg-[#F5F0E8]"
            >
              <span className="truncate">{product.name}</span>
              {product.product_code && <span className="shrink-0 text-xs text-[#2C3829]/40">{product.product_code}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
