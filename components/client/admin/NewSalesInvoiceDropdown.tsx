"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MdKeyboardArrowDown } from "react-icons/md";

interface NewSalesInvoiceDropdownProps {
  buttonClassName: string;
}

export function NewSalesInvoiceDropdown({ buttonClassName }: NewSalesInvoiceDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className={`${buttonClassName} gap-2`}
      >
        New Invoice
        <MdKeyboardArrowDown className={`text-lg transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      {isOpen && (
      <div role="menu" className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-[#d6c3b3]/40 bg-white p-1.5 shadow-lg">
        <Link
          role="menuitem"
          href="/admin/sales-invoices/new"
          onClick={() => setIsOpen(false)}
          className="block rounded-lg px-3 py-2.5 text-sm font-medium text-[#2C3829] transition-colors hover:bg-[#FAF7F2]"
        >
          GST Invoice
        </Link>
        <Link
          role="menuitem"
          href="/admin/sales-invoices/normal/new"
          onClick={() => setIsOpen(false)}
          className="block rounded-lg px-3 py-2.5 text-sm font-medium text-[#2C3829] transition-colors hover:bg-[#FAF7F2]"
        >
          Normal Invoice
        </Link>
      </div>
      )}
    </div>
  );
}
