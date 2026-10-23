import { notFound } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import CompanyForm from '@/components/client/admin/CompanyForm';
import type { IssuerCompany } from '@/utils/billing';

export const metadata = {
  title: 'Edit Company',
  robots: { index: false },
};

export const dynamic = 'force-dynamic';

export default async function EditCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data }, { count }] = await Promise.all([
    supabase.from('issuer_companies').select('*').eq('id', id).single(),
    supabase.from('issuer_companies').select('*', { count: 'exact', head: true }),
  ]);

  if (!data) notFound();

  return <CompanyForm initial={data as IssuerCompany} companiesCount={count ?? 0} />;
}
