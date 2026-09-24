import React from 'react';
import Link from 'next/link';
import {
  MdOutlineInventory2,
  MdOutlineVisibility,
  MdOutlineFavoriteBorder,
  MdOutlineShoppingCart,
} from 'react-icons/md';
import { Card } from '@/components/ui/Card';
import { MetricCard } from '@/components/ui/MetricCard';
import { DonutChart } from '@/components/ui/DonutChart';
import { ActivityRow } from '@/components/ui/ActivityRow';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { AnalyticsTrends } from '@/components/client/admin/AnalyticsTrends';
import { getAnalytics } from '@/utils/analytics';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Analytics',
  robots: { index: false },
};

export default async function AnalyticsPage() {
  const data = await getAnalytics();

  return (
    <main className="pt-[88px] lg:pt-6 px-6 lg:px-10 max-w-7xl mx-auto pb-6 lg:pb-10 min-h-screen">
      {/* Header */}
      <div className="border-b border-[#d6c3b3]/30 pb-6 mb-6">
        <h1 className="font-jost text-2xl lg:text-3xl font-bold text-[#2C3829] mb-2">Analytics</h1>
        <p className="text-[#2C3829]/70">Store engagement and product performance at a glance.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <MetricCard
          title="Total Products"
          value={data.stats.totalProducts.toLocaleString()}
          subtitle="In catalog"
          icon={MdOutlineInventory2}
        />
        <MetricCard
          title="Total Views"
          value={data.stats.totalViews.toLocaleString()}
          subtitle="Across all products"
          icon={MdOutlineVisibility}
        />
        <MetricCard
          title="Wishlisted"
          value={data.stats.wishlisted.toLocaleString()}
          subtitle="Wishlist items"
          icon={MdOutlineFavoriteBorder}
        />
        <MetricCard
          title="In Carts"
          value={data.stats.cartCount.toLocaleString()}
          subtitle="Cart items"
          icon={MdOutlineShoppingCart}
        />
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Left: Trends */}
        <Card className="lg:col-span-2 p-6 lg:p-8">
          <div className="mb-6">
            <h2 className="font-jost font-semibold text-[#2C3829]">User Interaction Trends</h2>
            <p className="text-[#2C3829]/60 text-sm">Traffic &amp; conversion flows</p>
          </div>
          <AnalyticsTrends initial={data.trend} />
        </Card>

        {/* Right: Popular Products */}
        <Card className="p-6 lg:p-8">
          <div className="mb-6">
            <h2 className="font-jost font-semibold text-[#2C3829]">Popular Products</h2>
            <p className="text-[#2C3829]/60 text-sm">View distribution</p>
          </div>
          <DonutChart
            segments={data.popularProducts}
            centerTitle="Top Product"
            centerValue={data.topProduct.title}
          />
        </Card>
      </div>

      {/* Product Views */}
      <Card className="p-6 lg:p-8 mb-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-jost font-semibold text-[#2C3829]">Product Views</h2>
            <p className="text-[#2C3829]/60 text-sm">Most-viewed products</p>
          </div>
          <Link
            href="/admin/analytics/views"
            className="text-[#4c623d] text-sm hover:underline shrink-0"
          >
            View All &rarr;
          </Link>
        </div>
        {data.productViews.length > 0 ? (
          <>
            {/* Mobile: stacked list */}
            <div className="md:hidden divide-y divide-[#d6c3b3]/25">
              {data.productViews.map((p, i) => (
                <div
                  key={`views-m-${i}`}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <span className="block font-medium text-[#2C3829] font-body-md break-words">
                      {p.name}
                    </span>
                    <span className="block text-xs text-[#2C3829]/50 font-jost">
                      {p.productCode}
                    </span>
                  </div>
                  <span className="font-jost font-semibold text-[#2C3829] shrink-0">
                    {p.views.toLocaleString()}
                    <span className="ml-1 text-xs font-normal text-[#2C3829]/50">views</span>
                  </span>
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Product Code</TableHead>
                    <TableHead className="text-right">Views</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.productViews.map((p, i) => (
                    <TableRow key={`views-d-${i}`}>
                      <TableCell>
                        <span className="font-medium text-[#2C3829] font-body-md break-words">{p.name}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-jost text-[#2C3829]">{p.productCode}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-jost font-semibold text-[#2C3829]">
                          {p.views.toLocaleString()}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <p className="text-[#2C3829]/60 text-sm py-6 text-center">No product views yet.</p>
        )}
      </Card>

      {/* Orders pipeline */}
      <Card className="p-6 lg:p-8 mb-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-jost font-semibold text-[#2C3829]">Orders</h2>
            <p className="text-[#2C3829]/60 text-sm">WhatsApp order pipeline</p>
          </div>
          <Link
            href="/admin/orders"
            className="text-[#4c623d] text-sm hover:underline shrink-0"
          >
            View All &rarr;
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Total", value: data.orders.total, cls: "text-[#2C3829]" },
            { label: "New", value: data.orders.initiated, cls: "text-amber-600" },
            { label: "Confirmed", value: data.orders.confirmed, cls: "text-[#4c623d]" },
            { label: "Fulfilled", value: data.orders.fulfilled, cls: "text-[#2C3829]" },
            { label: "Cancelled", value: data.orders.cancelled, cls: "text-red-500" },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl border border-[#d6c3b3]/30 bg-white/60 p-4 text-center"
            >
              <p className={`font-jost text-2xl font-bold ${s.cls}`}>
                {s.value.toLocaleString()}
              </p>
              <p className="text-[11px] uppercase tracking-wider text-[#2C3829]/50 mt-1">
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </Card>

      {/* Activity Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Wishlist Activity */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-jost font-semibold text-[#2C3829]">Wishlist Activity</h2>
            <Link
              href="/admin/analytics/wishlist"
              className="text-[#4c623d] text-sm hover:underline"
            >
              View All &rarr;
            </Link>
          </div>
          {data.wishlistActivity.length > 0 ? (
            <div className="space-y-4">
              {data.wishlistActivity.map((item, i) => (
                <ActivityRow key={`wishlist-${i}`} {...item} />
              ))}
            </div>
          ) : (
            <p className="text-[#2C3829]/60 text-sm py-6 text-center">No wishlist activity yet.</p>
          )}
        </div>

        {/* Cart Additions */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-jost font-semibold text-[#2C3829]">Cart Additions</h2>
            <Link
              href="/admin/analytics/cart"
              className="text-[#4c623d] text-sm hover:underline"
            >
              View All &rarr;
            </Link>
          </div>
          {data.cartAdditions.length > 0 ? (
            <div className="space-y-4">
              {data.cartAdditions.map((item, i) => (
                <ActivityRow key={`cart-${i}`} {...item} />
              ))}
            </div>
          ) : (
            <p className="text-[#2C3829]/60 text-sm py-6 text-center">No cart activity yet.</p>
          )}
        </div>
      </div>
    </main>
  );
}
