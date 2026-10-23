import { createClient } from '@/utils/supabase/server';
import CompanyForm from '@/components/client/admin/CompanyForm';

export const metadata = {
  title: 'Add Company',
  robots: { index: false },
};

export const dynamic = 'force-dynamic';

export default async function NewCompanyPage() {
  const supabase = await createClient();
  const { count } = await supabase
    .from('issuer_companies')
    .select('*', { count: 'exact', head: true });

  return <CompanyForm companiesCount={count ?? 0} />;
}
