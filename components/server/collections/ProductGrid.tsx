import Link from "next/link";
import { MdOutlineChevronLeft, MdOutlineChevronRight } from "react-icons/md";
import ProductCard from "../../client/product/ProductCard";
import { type ProductSort } from "@/utils/products";
import { slugForCategoryId, type StoreCategory } from "@/utils/categories";
import type { Product } from "@/types/product";

/** Products per page on the storefront Collections grid.
 *  Exported so the page's data fetch uses the exact same page size. */
export const PAGE_SIZE = 32;

interface ProductGridProps {
  items: Product[];
  total: number;
  /** Category list used to build each card's canonical product URL slug. */
  categories?: StoreCategory[];
  category?: string;
  page?: number;
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  onSale?: boolean;
  badges?: string[];
  inStock?: boolean;
  sizes?: string[];
  materials?: string[];
  sort?: ProductSort;
}

/**
 * Presentational product grid + pager. Data is fetched by the Collections page
 * (in parallel with facets/categories) and passed in, so this component adds no
 * round-trips of its own.
 */
export default function ProductGrid({
  items,
  total,
  categories = [],
  category,
  page,
  q,
  minPrice,
  maxPrice,
  onSale,
  badges,
  inStock,
  sizes,
  materials,
  sort,
}: ProductGridProps) {
  const currentPage = page && page > 0 ? page : 1;

  if (items.length === 0) {
    return (
      <div className="py-20 text-center">
        <p className="cormorant text-3xl text-primary">
          No pieces found here yet
        </p>
        <p className="jost mt-2 text-sm md:text-base text-muted">
          Try another category or check back soon for new arrivals.
        </p>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const from = (currentPage - 1) * PAGE_SIZE + 1;
  const to = Math.min(currentPage * PAGE_SIZE, total);

  const pageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (q) params.set("q", q);
    if (typeof minPrice === "number") params.set("minPrice", String(minPrice));
    if (typeof maxPrice === "number") params.set("maxPrice", String(maxPrice));
    if (onSale) params.set("onSale", "1");
    if (inStock) params.set("inStock", "1");
    if (badges && badges.length) params.set("badges", badges.join(","));
    if (sizes && sizes.length) params.set("sizes", sizes.join(","));
    if (materials && materials.length) params.set("materials", materials.join(","));
    if (sort && sort !== "newest") params.set("sort", sort);
    if (targetPage > 1) params.set("page", String(targetPage));
    const query = params.toString();
    return query ? `/collections?${query}` : "/collections";
  };

  const isFirst = currentPage <= 1;
  const isLast = currentPage >= totalPages;

  return (
    <div>
      <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-10">
        {items.map((p, idx) => (
          <ProductCard
            key={p.id}
            id={p.id}
            productCode={p.product_code}
            categorySlug={slugForCategoryId(categories, p.category_id)}
            title={p.name}
            originalPrice={p.original_price ?? 0}
            discountedPrice={p.discounted_price ?? p.original_price ?? 0}
            imageUrl={p.images?.[0]?.url ?? "/placeholder-product.jpg"}
            altText={p.name}
            badge={p.badges?.[0]}
            cropX={p.images?.[0]?.crop_x ?? 50}
            cropY={p.images?.[0]?.crop_y ?? 50}
            zoom={p.images?.[0]?.zoom ?? 100}
            deliveryDays={p.delivery_days}
            // Preload the first visible row (2-up on mobile) on page 1 so the
            // LCP product image is the fetchPriority=high image.
            priority={currentPage <= 1 && idx < 2}
          />
        ))}
      </section>

      {/* Pagination — matches the admin pager; hidden when there is only one page */}
      {totalPages > 1 && (
        <div className="mt-12 md:mt-16 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="jost text-xs md:text-sm text-muted text-center sm:text-left">
            Showing {from}&ndash;{to} of {total}
          </span>

          <div className="flex items-center gap-2">
            {isFirst ? (
              <span
                aria-disabled="true"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#d6c3b3]/50 text-muted opacity-30 cursor-not-allowed"
              >
                <MdOutlineChevronLeft className="text-xl" />
              </span>
            ) : (
              <Link
                href={pageHref(currentPage - 1)}
                aria-label="Previous page"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#d6c3b3]/50 text-[#2C3829] transition-all hover:bg-[#d6c3b3]/30"
              >
                <MdOutlineChevronLeft className="text-xl" />
              </Link>
            )}

            <span className="jost px-3 text-sm text-[#44483f]">
              Page {currentPage} of {totalPages}
            </span>

            {isLast ? (
              <span
                aria-disabled="true"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#d6c3b3]/50 text-muted opacity-30 cursor-not-allowed"
              >
                <MdOutlineChevronRight className="text-xl" />
              </span>
            ) : (
              <Link
                href={pageHref(currentPage + 1)}
                aria-label="Next page"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#d6c3b3]/50 text-[#2C3829] transition-all hover:bg-[#d6c3b3]/30"
              >
                <MdOutlineChevronRight className="text-xl" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
