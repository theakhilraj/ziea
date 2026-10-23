import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import InvoiceForm from '@/components/client/admin/InvoiceForm';
import type { IssuerCompany, BillingParty, BillingProduct } from '@/utils/billing';

export const metadata = {
  title: 'New Invoice',
  robots: { index: false },
};

export const dynamic = 'force-dynamic';

export default async function NewInvoicePage() {
  const supabase = await createClient();

  const [companiesRes, partiesRes, productsRes] = await Promise.all([
    supabase.from('issuer_companies').select('*').order('is_default', { ascending: false }).order('name'),
    supabase.from('billing_parties').select('*').order('name'),
    supabase.from('products').select('id, name, product_code, hsn_sac, gst_rate, uom, original_price, discounted_price').order('name'),
  ]);

  const companies = (companiesRes.data ?? []) as IssuerCompany[];
  // Can't raise an invoice without an issuer — send them to create one first.
  if (companies.length === 0) redirect('/admin/sales-invoices/settings');

  const parties = (partiesRes.data ?? []) as BillingParty[];
  const products: BillingProduct[] = (productsRes.data ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    product_code: (p.product_code as string) ?? null,
    hsn_sac: (p.hsn_sac as string) ?? null,
    gst_rate: (p.gst_rate as number) ?? null,
    uom: (p.uom as string) ?? null,
    price: (p.discounted_price as number) ?? (p.original_price as number) ?? null,
  }));

  return <InvoiceForm companies={companies} parties={parties} products={products} />;
}
