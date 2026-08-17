import { Metadata } from 'next';
import Link from 'next/link';
import Header from '../../components/client/layout/Header';
import Footer from '../../components/server/layout/Footer';
import ListManager, { type ListItem } from '../../components/client/shop/ListManager';
import { createClient } from '@/utils/supabase/server';
import { getCategories, slugForCategoryId } from '@/utils/categories';
import { formatINR } from '@/utils/price';
import { MdOutlineShoppingBag } from 'react-icons/md';

export const metadata: Metadata = {
  title: 'Shopping Cart',
  description: 'Review your selected items before checkout.',
  robots: { index: false, follow: false },
};

// Supabase's generated types can widen a to-one join to an array, so accept both shapes.
type JoinedProduct = {
  id: string;
  product_code: string;
  name: string;
  category_id: string | null;
  discounted_price: number | null;
  original_price: number | null;
  images: { url: string }[] | null;
};

interface CartRow {
  id: string;
  size: string | null;
  quantity: number;
  products: JoinedProduct | JoinedProduct[] | null;
}

export default async function CartPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let items: ListItem[] = [];

  if (user) {
    const [{ data }, categories] = await Promise.all([
      supabase
        .from('cart_items')
        .select(
          'id, size, quantity, products(id, product_code, name, category_id, discounted_price, original_price, images)'
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      getCategories(),
    ]);

    items = ((data ?? []) as CartRow[])
      .map((row): ListItem | null => {
        const product = Array.isArray(row.products) ? row.products[0] : row.products;
        if (!product) return null;
        const priceValue = product.discounted_price ?? product.original_price ?? 0;
        return {
          id: row.id,
          productId: product.id,
          productCode: product.product_code,
          categorySlug: slugForCategoryId(categories, product.category_id),
          title: product.name,
          variant: row.size ?? '',
          size: row.size,
          quantity: row.quantity,
          priceValue,
          price: formatINR(priceValue),
          image: product.images?.[0]?.url ?? '/placeholder-product.jpg',
        };
      })
      .filter((i): i is ListItem => i !== null);
  }

  return (
    <>
      <Header />
      
      <main className="bg-background mt-16 md:mt-24">

        <div className="w-full px-page pt-4 md:pt-6 pb-10 md:pb-14">

          {/* Breadcrumb */}
          <nav className="flex items-center text-[13px] md:text-sm text-muted mb-6 md:mb-8">
            <Link href="/" className="transition-colors hover:text-primary">Home</Link>
            <span className="mx-2 text-muted/40">/</span>
            <span className="text-text">Shopping Cart</span>
          </nav>

          {/* Heading */}
          <div className="mx-auto mb-8 md:mb-10 max-w-3xl text-center">
            <h1 className="cormorant text-5xl md:text-6xl text-primary-dark">
              Shopping Cart
            </h1>
            <p className="mt-5 font-jost text-base md:text-lg leading-8 text-muted">
              Review your selected items before checkout.
            </p>
          </div>

          <ListManager
            title="Cart"
            type="cart"
            icon={<MdOutlineShoppingBag />}
            emptyDescription="Your bag is looking a little empty. Discover our collections to add items."
            items={items}
          />

        </div>

      </main>
      
      <Footer />
    </>
  );
}
