import React from 'react';
import { AnalyticsPagination } from '@/components/ui/AnalyticsPagination';
import ConsultationsClient from '@/components/client/admin/ConsultationsClient';
import { createClient } from '@/utils/supabase/server';
import { istNowParts } from '@/utils/consultation';
import type { ConsultationSettings } from '@/utils/consultation';
import type {
  AdminConsultation,
  ConsultationStatus,
} from '@/app/actions/consultation-admin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Consultations | ZIEA Admin',
  robots: { index: false },
};

const PAGE_SIZE = 10;
const CONSULTATION_STATUSES = ['confirmed', 'completed', 'cancelled'] as const;

/** Add `days` whole days to a "YYYY-MM-DD" string, TZ-safe (UTC math). */
function addDaysISO(iso: string, days: number): string {
  const ms = Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000;
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

interface DayOffRow {
  id: string;
  day: string;
  reason: string | null;
}

export default async function ConsultationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string; page?: string }>;
}) {
  const supabase = await createClient();

  const params = await searchParams;
  // Bookings is the default landing tab; Availability is opt-in via ?tab=availability.
  const tab: 'bookings' |'availability' =
    params.tab === 'availability' ? 'availability' : 'bookings';
  const statusParam = params.status ?? '';
  const status: ConsultationStatus | 'all' = (
    CONSULTATION_STATUSES as readonly string[]
  ).includes(statusParam)
    ? (statusParam as ConsultationStatus)
    : 'all';
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { dateISO: todayISO } = istNowParts();

  // Settings + day-offs + the active tab's page of bookings + per-status counts +
  // the set of dates with active (non-cancelled) bookings — all concurrently.
  let bookingQuery = supabase
    .from('consultations')
    .select(
      'id, ref, name, email, phone, method, slot_date, slot_time, slot_minutes, notes, image_url, image_note, status, created_at',
      { count: 'exact' },
    )
    .order('slot_date', { ascending: false })
    .order('slot_time', { ascending: false })
    .range(from, to);

  if (status !== 'all') bookingQuery = bookingQuery.eq('status', status);

  const [settingsRes, daysOffRes, listRes, activeDatesRes, ...countRes] =
    await Promise.all([
      supabase
        .from('consultation_settings')
        .select(
          'id, work_start, work_end, slot_minutes, timezone, lead_time_hours, max_advance_days, updated_at',
        )
        .limit(1)
        .maybeSingle<ConsultationSettings>(),
      supabase
        .from('consultation_days_off')
        .select('id, day, reason')
        .order('day', { ascending: true }),
      bookingQuery,
      // Every active (non-cancelled) booking's date — so the day-off UI can WARN
      // before blocking a day that already has bookings. Bounded to today-onward:
      // only today-or-future days are blockable (the calendar's min is todayISO),
      // so this both scopes the warning correctly AND keeps the row set small
      // (an unbounded SELECT could hit PostgREST's max-rows cap and undercount).
      supabase
        .from('consultations')
        .select('slot_date')
        .neq('status', 'cancelled')
        .gte('slot_date', todayISO),
      ...CONSULTATION_STATUSES.map((s) =>
        supabase
          .from('consultations')
          .select('*', { count: 'exact', head: true })
          .eq('status', s),
      ),
    ]);

  const settings = settingsRes.data ?? null;

  const daysOff = ((daysOffRes.data ?? []) as DayOffRow[]).map((r) => ({
    id: r.id,
    day: r.day.slice(0, 10),
    reason: r.reason,
  }));

  const rows = (listRes.data ?? []) as AdminConsultation[];
  const total = listRes.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Map: "YYYY-MM-DD" -> number of active bookings on that day.
  const bookedDateCounts: Record<string, number> = {};
  for (const r of (activeDatesRes.data ?? []) as { slot_date: string }[]) {
    const day = r.slot_date.slice(0, 10);
    bookedDateCounts[day] = (bookedDateCounts[day] ?? 0) + 1;
  }

  const counts: Record<ConsultationStatus, number> = CONSULTATION_STATUSES.reduce(
    (acc, s, i) => {
      acc[s] = countRes[i]?.count ?? 0;
      return acc;
    },
    {} as Record<ConsultationStatus, number>,
  );

  // A generous 365-day picking window for blocking future days off.
  const maxISO = addDaysISO(todayISO, 365);

  const basePath =
    status === 'all'
      ? '/admin/consultations?tab=bookings'
      : `/admin/consultations?tab=bookings&status=${status}`;

  return (
    <main className="pt-20 lg:pt-6 px-6 lg:px-10 max-w-7xl mx-auto pb-6 lg:pb-10 min-h-screen">
      {/* Page Header Section */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 lg:gap-0 mb-6 border-b border-[#d6c3b3]/30 pb-5 lg:pb-6">
        <div>
          <h1 className="font-jost text-2xl lg:text-3xl text-[#2C3829] mb-2 font-bold">
            Consultations
          </h1>
          <p className="font-body-md lg:font-body-lg text-[#2C3829]/70">
            Designer consultation availability and bookings.
          </p>
        </div>
      </div>

      <ConsultationsClient
        tab={tab}
        settings={settings}
        daysOff={daysOff}
        bookedDateCounts={bookedDateCounts}
        todayISO={todayISO}
        maxISO={maxISO}
        rows={rows}
        status={status}
        counts={counts}
      />

      {tab === 'bookings' && (
        <AnalyticsPagination basePath={basePath} page={page} totalPages={totalPages} />
      )}
    </main>
  );
}
