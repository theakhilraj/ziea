import { notFound, permanentRedirect } from 'next/navigation';
import { getProductByCode } from '@/utils/products';
import { getCategories, slugForCategoryId } from '@/utils/categories';
import { productPath } from '@/utils/slug';

// Legacy compatibility route. The old product URL was flat: /collections/{code}
// (e.g. /collections/Z-0006). Product URLs are now nested under their category
// (/collections/{category}/{code}), so this single-segment route treats the
// segment as a product code and 308-redirects to the canonical nested URL.
// Anything that isn't a published product 404s.
interface PageProps {
  params: Promise<{ category: string }>;
}

// Dynamic redirector — nothing to prerender here (canonical pages live in
// the nested [category]/[code] route).
export function generateStaticParams() {
  return [];
}
export const dynamicParams = true;

export default async function LegacyProductRedirect(props: PageProps) {
  const { category: code } = await props.params;
  const product = await getProductByCode(code);

  if (!product) notFound();

  const categories = await getCategories();
  const categorySlug = slugForCategoryId(categories, product.category_id);
  permanentRedirect(productPath(product.product_code, categorySlug));
}
