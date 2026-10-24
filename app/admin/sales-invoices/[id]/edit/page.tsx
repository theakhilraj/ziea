import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import InvoiceForm from '@/components/client/admin/InvoiceForm';
import type { IssuerCompany, BillingParty, BillingProduct, SaleInvoice, SaleInvoiceItem } from '@/utils/billing';

export const metadata = {
  title: 'Edit Invoice',
  robots: { index: false },
};

export const dynamic = 'force-dynamic';

export default async function EditInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase.from('sale_invoices').select('*').eq('id', id).single();
  if (!invoice) notFound();
  if (invoice.invoice_kind === 'normal') redirect(`/admin/sales-invoices/normal/${id}/edit`);
  // Cancelled invoices are read-only.
  if (invoice.status === 'cancelled') redirect(`/admin/sales-invoices/${id}`);

  const [{ data: items }, companiesRes, partiesRes, productsRes] = await Promise.all([
    supabase.from('sale_invoice_items').select('*').eq('invoice_id', id).order('line_no', { ascending: true }),
    supabase.from('issuer_companies').select('*').order('is_default', { ascending: false }).order('name'),
    supabase.from('billing_parties').select('*').order('name'),
    supabase.from('products').select('id, name, product_code, hsn_sac, gst_rate, uom, original_price, discounted_price').order('name'),
  ]);

  const companies = (companiesRes.data ?? []) as IssuerCompany[];
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

  return (
    <InvoiceForm
      companies={companies}
      parties={parties}
      products={products}
      initial={{ invoice: invoice as SaleInvoice, items: (items ?? []) as SaleInvoiceItem[] }}
    />
  );
}
