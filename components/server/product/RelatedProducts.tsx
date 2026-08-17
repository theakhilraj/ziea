import React from 'react';
import ProductCard from '@/components/client/product/ProductCard';
import { getRelatedProducts } from '@/utils/products';
import { getCategories, slugForCategoryId } from '@/utils/categories';

interface RelatedProductsProps {
  categoryId: string | null;
  excludeId: string;
}

export default async function RelatedProducts({ categoryId, excludeId }: RelatedProductsProps) {
  const [products, categories] = await Promise.all([
    getRelatedProducts(categoryId, excludeId),
    getCategories(),
  ]);

  if (products.length === 0) return null;

  return (
    <div className="w-full space-y-6 mt-24 pt-16 border-t border-[#eee0d6]">
      <h2 className="cormorant text-3xl text-primary font-bold">You May Also Like</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 xl:gap-8">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            id={product.id}
            productCode={product.product_code}
            categorySlug={slugForCategoryId(categories, product.category_id)}
            title={product.name}
            originalPrice={product.original_price ?? 0}
            discountedPrice={product.discounted_price ?? product.original_price ?? 0}
            imageUrl={product.images?.[0]?.url ?? ''}
            badge={product.badges?.[0]}
            cropX={product.images?.[0]?.crop_x ?? 50}
            cropY={product.images?.[0]?.crop_y ?? 50}
            zoom={product.images?.[0]?.zoom ?? 100}
            deliveryDays={product.delivery_days}
          />
        ))}
      </div>
    </div>
  );
}
