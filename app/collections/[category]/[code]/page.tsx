import { Metadata } from 'next';
import Link from 'next/link';
import { MdInfoOutline } from 'react-icons/md';
import { notFound, permanentRedirect } from 'next/navigation';
import Header from '@/components/client/layout/Header';
import ProductGallery from '@/components/client/product/ProductGallery';
import ProductActions from '@/components/client/product/ProductActions';
import ProductInfo from '@/components/server/product/ProductInfo';
import ProductDetails from '@/components/server/product/ProductDetails';
import RelatedProducts from '@/components/server/product/RelatedProducts';
import ProductViewTracker from '@/components/client/product/ProductViewTracker';
import Footer from '@/components/server/layout/Footer';
import { getProductByCode, getAllPublishedSlugs } from '@/utils/products';
import { getCategories, slugForCategoryId } from '@/utils/categories';
import { productPath } from '@/utils/slug';
import { resolvePrice } from '@/utils/price';
import { SITE_NAME, absoluteUrl } from '@/utils/site';

interface PageProps {
  params: Promise<{ category: string; code: string }>;
}

// Prerender every published product at its canonical /collections/{category}/{code}
// path; unknown params still render on-demand.
export async function generateStaticParams() {
  const [slugs, categories] = await Promise.all([
    getAllPublishedSlugs(),
    getCategories(),
  ]);
  return slugs.map((s) => ({
    category: slugForCategoryId(categories, s.categoryId),
    code: s.code,
  }));
}
export const dynamicParams = true;

/** Strips HTML tags and collapses whitespace, then truncates to ~160 chars. */
function toMetaDescription(html: string | null): string {
  if (!html) return 'Discover premium ethnic wear at ZIEA.';
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

export async function generateMetadata(props: PageProps): Promise<Metadata> {
  const params = await props.params;
  const product = await getProductByCode(params.code);

  if (!product) {
    return { title: 'Product Not Found' };
  }

  const categories = await getCategories();
  const categorySlug = slugForCategoryId(categories, product.category_id);
  const description = toMetaDescription(product.description);
  const canonical = productPath(product.product_code, categorySlug);
  const image = product.images?.[0]?.url;

  return {
    title: product.name,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      title: `${product.name} | ${SITE_NAME}`,
      description,
      url: absoluteUrl(canonical),
      images: image ? [{ url: image, alt: product.name }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${product.name} | ${SITE_NAME}`,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ProductDetailPage(props: PageProps) {
  const params = await props.params;
  const product = await getProductByCode(params.code);

  if (!product) notFound();

  // Resolve the canonical category segment. If the URL's segment doesn't match
  // (old flat link, stale/renamed category, or a hand-typed wrong slug),
  // 308-redirect to the canonical /collections/{category}/{code}.
  const categories = await getCategories();
  const categorySlug = slugForCategoryId(categories, product.category_id);
  if (params.category !== categorySlug) {
    permanentRedirect(productPath(product.product_code, categorySlug));
  }

  const categoryName =
    categories.find((c) => c.id === product.category_id)?.name ?? 'Collections';

  const { price, original } = resolvePrice(product.original_price, product.discounted_price);
  const canonical = productPath(product.product_code, categorySlug);

  // Product structured data (rich results: price, availability, SKU).
  const priceValue = Number(product.discounted_price ?? product.original_price ?? 0);
  const inStock = (product.sizes ?? []).some((s) => s.quantity > 0);
  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.product_code,
    description: toMetaDescription(product.description),
    image: (product.images ?? []).map((img) => img.url).filter(Boolean),
    brand: { '@type': 'Brand', name: SITE_NAME },
    offers: {
      '@type': 'Offer',
      url: absoluteUrl(canonical),
      priceCurrency: 'INR',
      price: priceValue,
      availability: inStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <Header />
      <ProductViewTracker productId={product.id} />

      <main className="pt-20 md:pt-28 pb-16 min-h-screen w-full px-4 xl:px-8 max-w-[1600px] mx-auto">

        {/* Breadcrumbs */}
        <div className="mb-6 md:mb-8 mt-0">
          <nav className="flex text-[13px] md:text-sm text-[#44483f]">
            <Link href="/" className="hover:text-[#4c623d] transition-colors">Home</Link>
            <span className="mx-2">/</span>
            <Link href="/collections" className="hover:text-[#4c623d] transition-colors">{categoryName}</Link>
            <span className="mx-2">/</span>
            <span className="text-[#211a15] truncate max-w-[150px] md:max-w-xs">{product.name}</span>
          </nav>
        </div>

        {/* Product Layout */}
        <div className="flex flex-col md:grid md:grid-cols-2 lg:grid-cols-[1fr_1fr] xl:grid-cols-[5.5fr_4.5fr] gap-6 md:gap-10 lg:gap-16">

          {/* Left Column: Gallery (sticky on desktop while the right column scrolls) */}
          <div className="w-full md:sticky md:top-24 md:self-start">
            <ProductGallery images={product.images} />
            {/* Colour disclaimer — screens/lighting can shift how the fabric reads. */}
            <p className="mt-3 flex items-start gap-1.5 font-jost text-[12px] md:text-[13px] text-[#5c5349]">
              <MdInfoOutline className="mt-[2px] text-[15px] shrink-0 text-[#5c5349]/70" />
              <span>Actual product colour may differ slightly from the images shown.</span>
            </p>
          </div>

          {/* Right Column: Info & Actions */}
          <div className="w-full flex flex-col gap-6 pt-2 md:pt-0">
            <ProductInfo
              title={product.name}
              price={price}
              original={original ?? undefined}
              originalPrice={product.original_price}
              discountedPrice={product.discounted_price}
              description={product.description ?? ''}
              deliveryDays={product.delivery_days}
            />
            <ProductActions
              productId={product.id}
              sizes={product.sizes}
              productName={product.name}
              productCode={product.product_code}
              unitPrice={Number(product.discounted_price ?? product.original_price ?? 0)}
              imageUrl={product.images?.[0]?.url ?? ''}
            />
            <ProductDetails
              material={product.material ?? undefined}
              careInstructions={product.care_instructions ?? undefined}
              shippingInfo={product.shipping_info ?? undefined}
              contents={product.contents ?? undefined}
            />
          </div>

        </div>

        {/* Related Products Section (renders nothing — no border/gap — when empty) */}
        <RelatedProducts categoryId={product.category_id} excludeId={product.id} />

      </main>

      <Footer />
    </>
  );
}
