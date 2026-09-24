import React from 'react';
import { AnalyticsPagination } from '@/components/ui/AnalyticsPagination';
import EnquiriesClient, { type Enquiry } from '@/components/client/admin/EnquiriesClient';
import { createClient } from '@/utils/supabase/server';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Enquiries',
  robots: { index: false },
};

const PAGE_SIZE = 20;

type Tab = 'unread' | 'read';

export default async function EnquiriesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; page?: string }>;
}) {
  const supabase = await createClient();

  const params = await searchParams;
  const tab: Tab = params.tab === 'read' ? 'read' : 'unread';
  const isRead = tab === 'read';
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // The page's rows for the active tab, plus both tab counts — all concurrently.
  const [listRes, unreadRes, readRes] = await Promise.all([
    supabase
      .from('contact_messages')
      .select('id, name, email, phone, inquiry_type, message, created_at, is_read', {
        count: 'exact',
      })
      .eq('is_read', isRead)
      .order('created_at', { ascending: false })
      .range(from, to),
    supabase
      .from('contact_messages')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', false),
    supabase
      .from('contact_messages')
      .select('*', { count: 'exact', head: true })
      .eq('is_read', true),
  ]);

  const rows = (listRes.data ?? []) as Enquiry[];
  const total = listRes.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const unreadCount = unreadRes.count ?? 0;
  const readCount = readRes.count ?? 0;

  return (
    <main className="pt-20 lg:pt-6 px-6 lg:px-10 max-w-7xl mx-auto pb-6 lg:pb-10 min-h-screen">
      {/* Page Header Section */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 lg:gap-0 mb-6 border-b border-[#d6c3b3]/30 pb-5 lg:pb-6">
        <div>
          <h1 className="font-jost text-2xl lg:text-3xl text-[#2C3829] mb-2 font-bold">Enquiries</h1>
          <p className="font-body-md lg:font-body-lg text-[#2C3829]/70">
            Messages received through the Contact Us form.
          </p>
        </div>
      </div>

      <EnquiriesClient
        rows={rows}
        tab={tab}
        unreadCount={unreadCount}
        readCount={readCount}
      />

      <AnalyticsPagination basePath={`/admin/enquiries?tab=${tab}`} page={page} totalPages={totalPages} />
    </main>
  );
}
