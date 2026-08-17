"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createPortal } from "react-dom";
import { MdSearch, MdArrowBack, MdClose, MdOutlineCategory } from "react-icons/md";
import { formatINR } from "@/utils/price";
import { productPath } from "@/utils/slug";
import { useSearchSuggestions } from "./useSearchSuggestions";

/**
 * Full-screen mobile search. Opened from the header search icon; auto-focuses the
 * input, shows live product + category suggestions (same source as the desktop
 * SearchBar), and locks background scroll while open. Portalled to <body> so it
 * sits above the fixed header and any transformed ancestors.
 */
export default function MobileSearchOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [mounted, setMounted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { products, categories, loading } = useSearchSuggestions(q, open, 8);
  const hasResults = products.length > 0 || categories.length > 0;

  useEffect(() => setMounted(true), []);

  // Auto-focus + scroll lock while open; reset when it closes.
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      const id = setTimeout(() => inputRef.current?.focus(), 60);
      return () => {
        document.body.style.overflow = "";
        clearTimeout(id);
      };
    }
    setQ("");
  }, [open]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const term = q.trim();
    onClose();
    router.push(term ? `/collections?q=${encodeURIComponent(term)}` : "/collections");
  };

  if (!open || !mounted) return null;

  const term = q.trim();

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-background flex flex-col md:hidden animate-in fade-in duration-150">
      {/* Search bar row */}
      <div className="flex items-center gap-2 px-3 h-16 border-b border-border/60 bg-background shrink-0">
        <button
          onClick={onClose}
          aria-label="Close search"
          className="p-2 text-[#2C3829] active:scale-95 transition-transform"
        >
          <MdArrowBack className="text-2xl" />
        </button>
        <form onSubmit={submit} className="flex-1">
          <div className="relative">
            <MdSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#2C3829]/50 text-xl" />
            <input
              ref={inputRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search designs..."
              aria-label="Search designs"
              enterKeyHint="search"
              className="w-full pl-10 pr-10 py-2.5 border border-outline-variant rounded-xl bg-white font-jost text-base text-on-surface outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 transition-all"
            />
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  inputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#2C3829]/50 active:scale-90"
              >
                <MdClose className="text-lg" />
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {term.length < 2 ? (
          <p className="text-center text-muted font-jost text-sm py-12 px-8">
            Type at least 2 letters to search our collection.
          </p>
        ) : hasResults ? (
          <>
            {/* Category matches */}
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/collections?category=${c.id}`}
                onClick={onClose}
                className="flex items-center gap-3 px-4 py-3 border-b border-border/40 active:bg-[#FAF7F2] transition-colors"
              >
                <span className="flex w-11 h-14 items-center justify-center rounded-md bg-[#eee0d6]/60 shrink-0">
                  <MdOutlineCategory className="text-xl text-[#4c623d]" />
                </span>
                <span className="flex-1 min-w-0 truncate font-jost text-sm text-[#2C3829]">
                  {c.name}
                </span>
                <span className="font-jost text-[11px] uppercase tracking-wide text-[#2C3829]/50 shrink-0">
                  Category
                </span>
              </Link>
            ))}

            {/* Product matches */}
            {products.map((s) => (
              <Link
                key={s.product_code}
                href={productPath(s.product_code, s.categorySlug)}
                onClick={onClose}
                className="flex items-center gap-3 px-4 py-3 border-b border-border/40 active:bg-[#FAF7F2] transition-colors"
              >
                {s.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={s.image}
                    alt=""
                    className="w-11 h-14 object-cover rounded-md shrink-0 bg-muted/20"
                  />
                ) : null}
                <span className="flex-1 min-w-0 truncate font-jost text-sm text-[#2C3829]">
                  {s.name}
                </span>
                <span className="font-jost text-sm font-semibold text-[#4c623d] shrink-0">
                  {formatINR(s.price)}
                </span>
              </Link>
            ))}
            <button
              type="button"
              onClick={() => submit()}
              className="w-full text-left px-4 py-4 text-sm font-jost font-medium text-[#4c623d] active:bg-[#FAF7F2] transition-colors"
            >
              Search all results for &ldquo;{term}&rdquo; &rarr;
            </button>
          </>
        ) : loading ? (
          <p className="text-center text-muted font-jost text-sm py-12">Searching&hellip;</p>
        ) : (
          <p className="text-center text-muted font-jost text-sm py-12 px-8">
            No designs match &ldquo;{term}&rdquo;. Try another word.
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
