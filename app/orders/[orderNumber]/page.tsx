import { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import Header from '../../../components/client/layout/Header';
import Footer from '../../../components/server/layout/Footer';
import OrderStatusBadge from '../../../components/server/orders/OrderStatusBadge';
import OrderActions from '../../../components/client/orders/OrderActions';
import { getUserOrderByKey } from '@/utils/orders.server';
import { productPath } from '@/utils/slug';
import { formatINR } from '@/utils/price';
import { fullDate } from '@/utils/format';

export const metadata: Metadata = {
  title: 'Order Details',
  robots: { index: false, follow: false },
};

// A simple progress track for the happy path; Cancelled orders show a distinct note.
const TRACK = ['Initiated', 'Confirmed', 'Fulfilled'] as const;

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const order = await getUserOrderByKey(decodeURIComponent(orderNumber));
  if (!order) notFound();

  const currentStep = TRACK.indexOf(order.status as (typeof TRACK)[number]);
  const isCancelled = order.status === 'Cancelled';

  return (
    <>
      <Header />

      <main className="bg-background mt-16 md:mt-24">
        <div className="w-full px-page pt-4 md:pt-6 pb-10 md:pb-14">

          {/* Breadcrumb */}
          <nav className="flex items-center text-[13px] md:text-sm text-muted mb-6 md:mb-8">
            <Link href="/" className="transition-colors hover:text-primary">Home</Link>
            <span className="mx-2 text-muted/40">/</span>
            <Link href="/orders" className="transition-colors hover:text-primary">My Orders</Link>
            <span className="mx-2 text-muted/40">/</span>
            <span className="text-text">{order.orderNumber ?? 'Order'}</span>
          </nav>

          <div className="mx-auto max-w-3xl">

            {/* Header card */}
            <div className="rounded-2xl bg-surface shadow-[0px_2px_16px_rgba(44,56,41,0.08)] p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h1 className="cormorant text-3xl md:text-4xl text-primary-dark">
                    {order.orderNumber ?? 'Order'}
                  </h1>
                  <p className="mt-1 text-sm text-muted">Placed {fullDate(order.createdAt)}</p>
                </div>
                <OrderStatusBadge status={order.status} />
              </div>

              {/* Status track */}
              {isCancelled ? (
                <p className="mt-6 rounded-xl bg-gray-100 px-4 py-3 text-sm text-gray-600">
                  This order was cancelled.
                </p>
              ) : (
                <ol className="mt-6 flex items-center">
                  {TRACK.map((step, idx) => {
                    const done = idx <= currentStep;
                    return (
                      <li key={step} className="flex flex-1 items-center last:flex-none">
                        <div className="flex flex-col items-center">
                          <span
                            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                              done ? 'bg-primary text-white' : 'bg-background text-muted ring-1 ring-border'
                            }`}
                          >
                            {idx + 1}
                          </span>
                          <span className={`mt-1.5 text-[11px] ${done ? 'text-primary-dark' : 'text-muted'}`}>
                            {step}
                          </span>
                        </div>
                        {idx < TRACK.length - 1 && (
                          <span
                            className={`mx-2 h-0.5 flex-1 rounded ${
                              idx < currentStep ? 'bg-primary' : 'bg-border'
                            }`}
                          />
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            {/* Line items */}
            <div className="mt-5 rounded-2xl bg-surface shadow-[0px_2px_16px_rgba(44,56,41,0.08)] overflow-hidden">
              <ul className="divide-y divide-border/50">
                {order.items.map((item) => {
                  const href =
                    item.productCode ? productPath(item.productCode, item.categorySlug) : null;
                  const name = item.productName ?? 'Item';
                  return (
                    <li key={item.id} className="flex gap-4 p-4 md:p-5">
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-background">
                        <Image
                          src={item.image}
                          alt={item.productName ?? 'Ordered item'}
                          fill
                          sizes="80px"
                          className="object-cover"
                        />
                      </div>
                      <div className="flex flex-1 flex-col">
                        {href ? (
                          <Link
                            href={href}
                            className="font-jost font-medium text-text hover:text-primary transition-colors"
                          >
                            {name}
                          </Link>
                        ) : (
                          <span className="font-jost font-medium text-text">{name}</span>
                        )}
                        <p className="mt-0.5 text-[13px] text-muted">
                          {item.size ? `Size ${item.size} · ` : ''}Qty {item.quantity}
                          {item.productCode ? ` · ${item.productCode}` : ''}
                        </p>
                        <div className="mt-2">
                          <OrderStatusBadge status={item.status} />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-jost font-semibold text-text">{formatINR(item.subtotal)}</p>
                        {item.quantity > 1 && (
                          <p className="text-[12px] text-muted">{formatINR(item.unitPrice)} each</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Summary */}
              <div className="flex items-center justify-between border-t border-border/50 px-5 py-4">
                <span className="font-jost text-muted">
                  Total ({order.itemCount} {order.itemCount === 1 ? 'item' : 'items'})
                </span>
                <span className="cormorant text-2xl text-primary-dark">{formatINR(order.total)}</span>
              </div>
            </div>

            {/* Actions */}
            <OrderActions order={order} />

          </div>
        </div>
      </main>

      <Footer />
    </>
  );
}
