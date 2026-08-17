import { Metadata } from 'next';
import Link from 'next/link';
import Header from '../../components/client/layout/Header';
import Footer from '../../components/server/layout/Footer';
import OrdersList from '../../components/client/orders/OrdersList';
import { getUserId } from '@/utils/supabase/user';
import { getUserOrders } from '@/utils/orders.server';

export const metadata: Metadata = {
  title: 'My Orders',
  description: 'Track and revisit the pieces you have ordered.',
  robots: { index: false, follow: false },
};

export default async function OrdersPage() {
  const userId = await getUserId();
  const orders = userId ? await getUserOrders() : [];

  return (
    <>
      <Header />

      <main className="bg-background mt-16 md:mt-24">
        <div className="w-full px-page pt-4 md:pt-6 pb-10 md:pb-14">

          {/* Breadcrumb */}
          <nav className="flex items-center text-[13px] md:text-sm text-muted mb-6 md:mb-8">
            <Link href="/" className="transition-colors hover:text-primary">Home</Link>
            <span className="mx-2 text-muted/40">/</span>
            <span className="text-text">My Orders</span>
          </nav>

          {/* Heading */}
          <div className="mx-auto mb-8 md:mb-10 max-w-3xl text-center">
            <h1 className="cormorant text-5xl md:text-6xl text-primary-dark">
              My Orders
            </h1>
            <p className="mt-5 font-jost text-base md:text-lg leading-8 text-muted">
              Track and revisit the pieces you have ordered.
            </p>
          </div>

          <OrdersList orders={orders} signedIn={Boolean(userId)} />

        </div>
      </main>

      <Footer />
    </>
  );
}
