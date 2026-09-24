import React from 'react';
import { AnalyticsPagination } from '@/components/ui/AnalyticsPagination';
import DesignInquiriesClient from '@/components/client/admin/DesignInquiriesClient';
import { createClient } from '@/utils/supabase/server';
import type {
  AdminDesignInquiry,
  DesignInquiryStatus,
  DesignInquirySettings,
} from '@/utils/inquiry';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Design Inquiries',
  robots: { index: false },
};

const PAGE_SIZE = 10;
const STATUSES = ['new', 'reviewed', 'closed'] as const;

export default async function DesignInquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const supabase = await createClient();

  const params = await searchParams;
  const statusParam = params.status ?? '';
  const status: DesignInquiryStatus | 'all' = (
    STATUSES as readonly string[]
  ).includes(statusParam)
    ? (statusParam as DesignInquiryStatus)
    : 'all';
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let listQuery = supabase
    .from('design_inquiries')
    .select(
      'id, ref, mode, name, email, phone, garment, requirements, theme, bust_chest, size_unit, delivery_date, members, image_urls, image_note, status, created_at',
      { count: 'exact' },
    )
    .order('created_at', { ascending: false })
    .range(from, to);

  if (status !== 'all') listQuery = listQuery.eq('status', status);

  const [settingsRes, listRes, ...countRes] = await Promise.all([
    supabase
      .from('design_inquiry_settings')
      .select('id, delivery_lead_days, max_advance_days, updated_at')
      .limit(1)
      .maybeSingle<DesignInquirySettings>(),
    listQuery,
    ...STATUSES.map((s) =>
      supabase
        .from('design_inquiries')
        .select('*', { count: 'exact', head: true })
        .eq('status', s),
    ),
  ]);

  const settings = settingsRes.data ?? null;

  const rows = (listRes.data ?? []) as AdminDesignInquiry[];
  const total = listRes.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const counts: Record<DesignInquiryStatus, number> = STATUSES.reduce(
    (acc, s, i) => {
      acc[s] = countRes[i]?.count ?? 0;
      return acc;
    },
    {} as Record<DesignInquiryStatus, number>,
  );

  const basePath =
    status === 'all'
      ? '/admin/design-inquiries'
      : `/admin/design-inquiries?status=${status}`;

  return (
    <main className="pt-20 lg:pt-6 px-6 lg:px-10 max-w-7xl mx-auto pb-6 lg:pb-10 min-h-screen">
      {/* Page Header Section */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 lg:gap-0 mb-4 border-b border-[#d6c3b3]/30 pb-4 lg:pb-4">
        <div>
          <h1 className="font-jost text-2xl lg:text-3xl text-[#2C3829] mb-1 font-bold">
            Design Inquiries
          </h1>
          <p className="font-body-md lg:font-body-lg text-[#2C3829]/70">
            Custom design inquiries shared from the Customisation Studio.
          </p>
        </div>
      </div>

      <DesignInquiriesClient
        rows={rows}
        settings={settings}
        status={status}
        counts={counts}
      />

      <AnalyticsPagination basePath={basePath} page={page} totalPages={totalPages} />
    </main>
  );
}
