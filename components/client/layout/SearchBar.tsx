"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MdSearch, MdOutlineCategory } from "react-icons/md";
import { formatINR } from "@/utils/price";
import { productPath } from "@/utils/slug";
import { useSearchSuggestions } from "./useSearchSuggestions";

/**
 * Search input with live suggestions. Debounced client-side query against
 * published products (name match) plus matching categories; Enter runs the full
 * /collections search, clicking a product jumps to it, clicking a category opens
 * the filtered collection.
 */
export default function SearchBar({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const { products, categories } = useSearchSuggestions(q, true, 6);
  const hasResults = products.length > 0 || categories.length > 0;

  // Open the dropdown whenever there are results for the current query.
  useEffect(() => {
    if (hasResults) setOpen(true);
  }, [hasResults]);

  // Close on outside click.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setOpen(false);
    const term = q.trim();
    router.push(term ? `/collections?q=${encodeURIComponent(term)}` : "/collections");
  };

  const close = () => {
    setOpen(false);
    setQ("");
  };

  return (
    <div ref={wrapRef} className={`relative z-10 ${className}`}>
      <form onSubmit={submit}>
        <div className="relative">
          <MdSearch className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#2C3829]/50 text-xl" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => hasResults && setOpen(true)}
            placeholder="Search designs..."
            aria-label="Search designs"
            className="w-full pl-12 pr-4 py-3 border border-outline-variant rounded-xl bg-white font-jost text-base text-on-surface outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 hover:border-primary/50 transition-all"
          />
        </div>
      </form>

      {open && hasResults && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-xl shadow-xl border border-black/5 overflow-hidden py-1 animate-in fade-in slide-in-from-top-1 duration-150">
          {/* Category matches */}
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/collections?category=${c.id}`}
              onClick={close}
              className="flex items-center gap-3 px-3 py-2 hover:bg-[#FAF7F2] transition-colors"
            >
              <span className="flex w-9 h-11 items-center justify-center rounded-md bg-[#eee0d6]/60 shrink-0">
                <MdOutlineCategory className="text-lg text-[#4c623d]" />
              </span>
              <span className="flex-1 min-w-0 truncate font-jost text-sm text-[#2C3829]">{c.name}</span>
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
              onClick={close}
              className="flex items-center gap-3 px-3 py-2 hover:bg-[#FAF7F2] transition-colors"
            >
              {s.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.image} alt="" className="w-9 h-11 object-cover rounded-md shrink-0 bg-muted/20" />
              ) : null}
              <span className="flex-1 min-w-0 truncate font-jost text-sm text-[#2C3829]">{s.name}</span>
              <span className="font-jost text-sm font-semibold text-[#4c623d] shrink-0">
                {formatINR(s.price)}
              </span>
            </Link>
          ))}

          <button
            type="button"
            onClick={() => submit()}
            className="w-full text-left px-3 py-2 text-xs font-jost text-[#2C3829]/70 hover:bg-[#FAF7F2] border-t border-[#d6c3b3]/30 transition-colors"
          >
            Search all results for &ldquo;{q.trim()}&rdquo; &rarr;
          </button>
        </div>
      )}
    </div>
  );
}
