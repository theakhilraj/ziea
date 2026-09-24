import React, { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getAdminClaims } from '@/utils/admin/session';
import AdminNavigation from '@/components/client/admin/AdminNavigation';
import AdminNavServer from '@/components/server/admin/AdminNavServer';
import ActivityNotificationsProvider from '@/components/client/admin/ActivityNotificationsProvider';
import EnquiriesProvider from '@/components/client/admin/EnquiriesProvider';
import OrdersProvider from '@/components/client/admin/OrdersProvider';
import ConsultationsProvider from '@/components/client/admin/ConsultationsProvider';
import DesignInquiriesProvider from '@/components/client/admin/DesignInquiriesProvider';

// Admin-only title template. Overrides the root layout's "%s | ZIEA" so admin
// pages read "<Page> | ZIEA Admin" (each page sets just the bare name — the
// suffix is applied here, once, avoiding the doubled "| ZIEA Admin | ZIEA").
export const metadata = {
  title: {
    template: '%s | ZIEA Admin',
    default: 'ZIEA Admin',
  },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Local JWT verification + role claim (no Auth-server round-trip; and no DB
  // query at all once the custom-claim hook is configured, so this gate stops
  // blocking the page content below).
  const claims = await getAdminClaims();

  if (!claims) {
    redirect('/login?next=/admin');
  }

  if (claims.role !== 'Admin') {
    redirect('/');
  }

  return (
    <ActivityNotificationsProvider>
      <EnquiriesProvider>
      <OrdersProvider>
      <ConsultationsProvider>
      <DesignInquiriesProvider>
      <div className="bg-[#F5F0E8] font-body-md text-body-md pb-0 lg:pl-72 min-h-screen">
        {/* Nav profile streams in so it never blocks the page content. The
            fallback renders the full sidebar (just without the avatar). */}
        <Suspense fallback={<AdminNavigation initialProfile={null} initialUserId={claims.userId} />}>
          <AdminNavServer userId={claims.userId} />
        </Suspense>

        {/* Main Content Canvas */}
        {children}
      </div>
      </DesignInquiriesProvider>
      </ConsultationsProvider>
      </OrdersProvider>
      </EnquiriesProvider>
    </ActivityNotificationsProvider>
  );
}
