"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { slugifyCategory } from "@/utils/slug";

export interface ProductSuggestion {
  product_code: string;
  name: string;
  price: number;
  image?: string;
  /** Slug of the product's category, for the canonical /collections/{cat}/{code} URL. */
  categorySlug?: string;
}

export interface CategorySuggestion {
  id: string;
  name: string;
}

/**
 * Live search suggestions shared by the desktop SearchBar and the mobile
 * overlay. Debounced (200ms, min 2 chars) name-match against published
 * products, plus name-match against categories so the search bar surfaces
 * categories (e.g. "Nightwear") alongside products. The category list is
 * loaded once and reused to (a) match category suggestions and (b) resolve
 * each product's category slug for its canonical URL.
 */
export function useSearchSuggestions(
  q: string,
  active: boolean,
  limit = 6,
): {
  products: ProductSuggestion[];
  categories: CategorySuggestion[];
  loading: boolean;
} {
  const supabase = useMemo(() => createClient(), []);
  const [catList, setCatList] = useState<CategorySuggestion[]>([]);
  const [products, setProducts] = useState<ProductSuggestion[]>([]);
  const [categories, setCategories] = useState<CategorySuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  // Load the category list once (small, cached by the browser) — used for both
  // category suggestions and product-slug resolution.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("categories")
      .select("id, name")
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (!cancelled) setCatList((data as CategorySuggestion[]) ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  useEffect(() => {
    if (!active) return;
    const term = q.trim();
    if (term.length < 2) {
      setProducts([]);
      setCategories([]);
      setLoading(false);
      return;
    }
    const lower = term.toLowerCase();
    const escaped = term.replace(/[%,]/g, "");
    setLoading(true);
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("products")
        .select("product_code, name, category_id, discounted_price, original_price, images")
        .eq("is_published", true)
        .eq("status", "published")
        .ilike("name", `%${escaped}%`)
        .limit(limit);

      const slugFor = (id: string | null): string | undefined => {
        const c = id ? catList.find((cat) => cat.id === id) : null;
        return c ? slugifyCategory(c.name) : undefined;
      };

      setProducts(
        (data ?? []).map((p: any) => ({
          product_code: p.product_code,
          name: p.name,
          price: p.discounted_price ?? p.original_price ?? 0,
          image: p.images?.[0]?.url,
          categorySlug: slugFor(p.category_id),
        })),
      );
      setCategories(catList.filter((c) => c.name.toLowerCase().includes(lower)));
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [q, active, supabase, limit, catList]);

  return { products, categories, loading };
}
