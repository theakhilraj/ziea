import Link from "next/link";
import ProductCard from "../../client/product/ProductCard";
import type { Product } from "@/types/product";
import { getLatestProducts } from "@/utils/products";
import { getCategories, slugForCategoryId } from "@/utils/categories";

export default async function CollectionsGrid() {
  // Cached catalog read only — wishlist heart state is hydrated client-side via
  // WishlistProvider, so this stays static (no cookie read → no forced SSR).
  const [products, categories] = await Promise.all([
    getLatestProducts(8),
    getCategories(),
  ]);

  return (
    <section className="px-page space-y-8 bg-background">
      {/* Heading */}
      <div className="flex justify-between items-end">
        <h2 className="cormorant text-2xl md:text-3xl text-primary-dark">
          Latest Collections
        </h2>

        <Link
          href="/collections"
          className="font-label-sm text-[#4c623d] border-b border-[#4c623d] pb-1"
        >
          View all collections
        </Link>
      </div>

      {/* Empty State (matches the Collections page product empty state) */}
      {!products || products.length === 0 ? (
        <div className="py-20 text-center">
          <p className="cormorant text-3xl text-primary">
            No pieces here yet
          </p>
          <p className="jost mt-2 text-sm md:text-base text-muted">
            Our latest arrivals are on their way - check back soon.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-4 md:gap-y-10">
          {(products as Product[]).map((product) => (
            <ProductCard
              key={product.id}
              id={product.id}
              productCode={product.product_code}
              categorySlug={slugForCategoryId(categories, product.category_id)}
              title={product.name}
              originalPrice={product.original_price ?? 0}
              discountedPrice={
                product.discounted_price ??
                product.original_price ??
                0
              }
              imageUrl={
                product.images?.[0]?.url ??
                "/placeholder-product.jpg"
              }
              altText={product.name}
              badge={product.badges?.[0]}
              cropX={product.images?.[0]?.crop_x ?? 50}
              cropY={product.images?.[0]?.crop_y ?? 50}
              zoom={product.images?.[0]?.zoom ?? 100}
              deliveryDays={product.delivery_days}
            />
          ))}
        </div>
      )}
    </section>
  );
}