import React from 'react';
import Link from 'next/link';
import { MdArrowBack, MdOutlineVisibility } from 'react-icons/md';
import { Card } from '@/components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/Table';
import { AnalyticsPagination } from '@/components/ui/AnalyticsPagination';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Product Views',
  robots: { index: false },
};

const PAGE_SIZE = 20;

interface ViewRow {
  productCode: string;
  productName: string;
  views: number;
}

export default async function ProductViewsPage({
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
    .from('products')
    .select('product_code, name, view_count', { count: 'exact' })
    .order('view_count', { ascending: false })
    .range(from, to);

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const rows: ViewRow[] = (data ?? []).map((row: any) => ({
    productCode: row.product_code ?? '-',
    productName: row.name ?? 'Unnamed',
    views: row.view_count ?? 0,
  }));

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
            Product Views
          </h1>
          <p className="text-[#2C3829]/70">Every product ranked by view count.</p>
        </div>
      </div>

      <Card className="!rounded-xl !p-0 border border-[#d6c3b3]/30 overflow-hidden">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-16 text-center">
            <MdOutlineVisibility className="text-[#2C3829]/30 text-5xl" />
            <span className="text-[#2C3829]/60 font-body-md">No product views yet.</span>
          </div>
        ) : (
          <>
            {/* Mobile View: Cards */}
            <div className="md:hidden divide-y divide-[#d6c3b3]/30">
              {rows.map((row, i) => (
                <div key={i} className="p-4 flex flex-col gap-3">
                  <span className="font-medium text-[#2C3829] font-body-md break-words">
                    {row.productName}
                  </span>
                  <div className="flex flex-col gap-2 bg-white/50 p-3 rounded-lg border border-[#d6c3b3]/30">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#2C3829]/50 font-label-sm uppercase tracking-wider text-xs">Product Code</span>
                      <span className="text-[#2C3829] font-jost font-medium">{row.productCode}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#2C3829]/50 font-label-sm uppercase tracking-wider text-xs">Views</span>
                      <span className="text-[#2C3829] font-jost font-semibold">{row.views.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop View: Table */}
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
                  {rows.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <span className="font-medium text-[#2C3829] font-body-md break-words">{row.productName}</span>
                      </TableCell>
                      <TableCell>
                        <span className="font-jost text-[#2C3829]">{row.productCode}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="font-jost font-semibold text-[#2C3829]">
                          {row.views.toLocaleString()}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </Card>

      <AnalyticsPagination basePath="/admin/analytics/views" page={page} totalPages={totalPages} />
    </main>
  );
}
