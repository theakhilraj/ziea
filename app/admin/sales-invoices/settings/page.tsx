import { createClient } from '@/utils/supabase/server';
import ClientInformationClient from '@/components/client/admin/ClientInformationClient';
import type { IssuerCompany } from '@/utils/billing';

export const metadata = {
  title: 'Client Information',
  robots: { index: false },
};

export const dynamic = 'force-dynamic';

// "Client Information" = the issuer company profiles used on invoices (Ziea or
// any other company): logo, GSTIN, bank details, address, terms, signatory. One
// profile can be marked default and pre-fills every new invoice.
export default async function ClientInformationPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from('issuer_companies')
    .select('*')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true });

  return (
    <main className="pt-20 lg:pt-6 px-6 lg:px-10 max-w-7xl mx-auto pb-6 lg:pb-10 min-h-screen">
      <ClientInformationClient initialCompanies={(data ?? []) as IssuerCompany[]} />
    </main>
  );
}
