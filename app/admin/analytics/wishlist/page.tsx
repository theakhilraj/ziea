import React from 'react';
import Link from 'next/link';
import { MdArrowBack, MdOutlineFavoriteBorder } from 'react-icons/md';
import { Card } from '@/components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { AnalyticsPagination } from '@/components/ui/AnalyticsPagination';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Wishlist Activity',
  robots: { index: false },
};

const PAGE_SIZE = 20;

// The generated Supabase types may type the joined relations as either a single
// object or an array (depending on how the FK is inferred). Handle both shapes.
type JoinedUser = { first_name: string | null; last_name: string | null; email: string | null };
type JoinedProduct = { product_code: string | null; name: string | null };

function firstOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

interface WishlistRow {
  userName: string;
  userEmail: string;
  productCode: string;
  productName: string;
  createdAt: string | null;
}

export default async function WishlistActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const supabase = await createClient();

  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, count } = await supabase
    .from('wishlist_items')
    .select('created_at, users(first_name, last_name, email), products(product_code, name)', {
      count: 'exact',
    })
    .order('created_at', { ascending: false })
    .range(from, to);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rows: WishlistRow[] = (data ?? []).map((row: any) => {
    const user = firstOrNull<JoinedUser>(row.users);
    const product = firstOrNull<JoinedProduct>(row.products);
    const name = `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim();
    return {
      userName: name || 'Unknown User',
      userEmail: user?.email ?? '',
      productCode: product?.product_code ?? '-',
      productName: product?.name ?? '',
      createdAt: row.created_at ?? null,
    };
  });

  const getInitials = (name: string, email: string) => {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (email[0] ?? 'U').toUpperCase();
  };

  return (
    <main className="pt-[88px] lg:pt-6 px-6 lg:px-10 max-w-7xl mx-auto pb-6 lg:pb-10 min-h-screen">
      {/* Header */}
      <div className="border-b border-[#d6c3b3]/30 pb-6 mb-6 flex items-center gap-4">
        <Link
          href="/admin/analytics"
          aria-label="Back to Analytics"
          className="w-10 h-10 rounded-full bg-white border border-[#d6c3b3]/40 shadow-sm flex items-center justify-center text-[#2C3829] hover:bg-[#FAF7F2] active:scale-95 transition-all shrink-0"
        >
          <MdArrowBack className="text-xl" />
        </Link>
        <div>
          <h1 className="font-jost text-2xl lg:text-3xl font-bold text-[#2C3829]">
            Wishlist Activity
          </h1>
          <p className="text-[#2C3829]/70">Users who added products to their wishlist.</p>
        </div>
      </div>

      <Card className="!rounded-xl !p-0 border border-[#d6c3b3]/30 overflow-hidden">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-16 text-center">
            <MdOutlineFavoriteBorder className="text-[#2C3829]/30 text-5xl" />
            <span className="text-[#2C3829]/60 font-body-md">
              No one has added to their wishlist yet.
            </span>
          </div>
        ) : (
          <>
            {/* Mobile View: Cards */}
            <div className="md:hidden divide-y divide-[#d6c3b3]/30">
              {rows.map((row, i) => {
                const dateObj = row.createdAt ? new Date(row.createdAt) : null;
                const formattedDate = dateObj?.toLocaleDateString('en-IN', {
                  day: 'numeric', month: 'short', year: 'numeric',
                });
                const formattedTime = dateObj?.toLocaleTimeString('en-IN', {
                  hour: '2-digit', minute: '2-digit',
                });
                return (
                  <div key={i} className="p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center font-jost font-medium text-sm bg-[#d6c3b3]/30 text-[#2C3829] flex-shrink-0">
                        {getInitials(row.userName, row.userEmail)}
                      </div>
                      <div className="min-w-0">
                        <span className="block font-medium text-[#2C3829] font-body-md truncate">
                          {row.userName}
                        </span>
                        <span className="block text-[#2C3829]/60 font-body-sm truncate">
                          {row.userEmail}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 bg-white/50 p-3 rounded-lg border border-[#d6c3b3]/30">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[#2C3829]/50 font-label-sm uppercase tracking-wider text-xs">Product Code</span>
                        <span className="text-[#2C3829] font-jost font-medium">{row.productCode}</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[#2C3829]/50 font-label-sm uppercase tracking-wider text-xs">Added</span>
                        <span className="text-[#2C3829]/80 font-jost text-right">
                          {formattedDate ?? '-'}
                          {formattedTime && <span className="block text-[#2C3829]/50 text-xs">{formattedTime}</span>}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop View: Table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    <TableHead>Product Code</TableHead>
                    <TableHead className="text-right">Added</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => {
                    const dateObj = row.createdAt ? new Date(row.createdAt) : null;
                    const formattedDate = dateObj?.toLocaleDateString('en-IN', {
                      day: 'numeric', month: 'short', year: 'numeric',
                    });
                    const formattedTime = dateObj?.toLocaleTimeString('en-IN', {
                      hour: '2-digit', minute: '2-digit',
                    });
                    return (
                      <TableRow key={i}>
                        <TableCell>
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center font-jost font-medium text-sm bg-[#d6c3b3]/30 text-[#2C3829] transition-transform group-hover:scale-105 flex-shrink-0">
                              {getInitials(row.userName, row.userEmail)}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-medium text-[#2C3829] font-body-md">{row.userName}</span>
                              <span className="text-[#2C3829]/60 font-body-sm">{row.userEmail}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-jost text-[#2C3829]">{row.productCode}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end">
                            <span className="text-[#2C3829] font-medium font-jost text-sm">
                              {formattedDate ?? '—'}
                            </span>
                            {formattedTime && (
                              <span className="text-[#2C3829]/60 font-jost text-xs mt-0.5">
                                {formattedTime}
                              </span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>

      <AnalyticsPagination basePath="/admin/analytics/wishlist" page={page} totalPages={totalPages} />
    </main>
  );
}
