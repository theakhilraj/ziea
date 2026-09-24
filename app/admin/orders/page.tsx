import React from 'react';
import { AnalyticsPagination } from '@/components/ui/AnalyticsPagination';
import OrdersClient from '@/components/client/admin/OrdersClient';
import { type Order, ORDER_STATUSES, type OrderStatus } from '@/utils/orders';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Orders',
  robots: { index: false },
};

const PAGE_SIZE = 20;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const supabase = await createClient();

  const params = await searchParams;
  const status: OrderStatus = (ORDER_STATUSES as readonly string[]).includes(params.status ?? '')
    ? (params.status as OrderStatus)
    : 'Initiated';
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // The active tab's page of orders + a count for every status tab, concurrently.
  const [listRes, ...countRes] = await Promise.all([
    supabase
      .from('orders')
      .select(
        'id, customer_name, customer_phone, product_id, product_code, product_name, size, quantity, unit_price, subtotal, status, source, created_at',
        { count: 'exact' },
      )
      .eq('status', status)
      .order('created_at', { ascending: false })
      .range(from, to),
    ...ORDER_STATUSES.map((s) =>
      supabase.from('orders').select('*', { count: 'exact', head: true }).eq('status', s),
    ),
  ]);

  const rows = (listRes.data ?? []) as Order[];
  const total = listRes.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const counts: Record<OrderStatus, number> = ORDER_STATUSES.reduce(
    (acc, s, i) => {
      acc[s] = countRes[i]?.count ?? 0;
      return acc;
    },
    {} as Record<OrderStatus, number>,
  );

  return (
    <main className="pt-20 lg:pt-6 px-6 lg:px-10 max-w-7xl mx-auto pb-6 lg:pb-10 min-h-screen">
      {/* Page Header Section */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 lg:gap-0 mb-6 border-b border-[#d6c3b3]/30 pb-5 lg:pb-6">
        <div>
          <h1 className="font-jost text-2xl lg:text-3xl text-[#2C3829] mb-2 font-bold">Orders</h1>
          <p className="font-body-md lg:font-body-lg text-[#2C3829]/70">
            WhatsApp orders placed through Buy Now.
          </p>
        </div>
      </div>

      <OrdersClient rows={rows} status={status} counts={counts} />

      <AnalyticsPagination basePath={`/admin/orders?status=${status}`} page={page} totalPages={totalPages} />
    </main>
  );
}
