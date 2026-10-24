import { notFound } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import InvoiceView from '@/components/client/admin/InvoiceView';
import type { SaleInvoice, SaleInvoiceItem, PaymentReceipt, IssuerCompany } from '@/utils/billing';

export const metadata = {
  title: 'Invoice',
  robots: { index: false },
};

export const dynamic = 'force-dynamic';

export default async function InvoiceViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: invoice } = await supabase.from('sale_invoices').select('*').eq('id', id).single();
  if (!invoice) notFound();

  const [{ data: items }, { data: payments }] = await Promise.all([
    supabase.from('sale_invoice_items').select('*').eq('invoice_id', id).order('line_no', { ascending: true }),
    supabase.from('payment_receipts').select('*').eq('invoice_id', id).order('payment_date', { ascending: true }),
  ]);

  // Prefer the frozen snapshot; only look up the logo when an older snapshot lacks it.
  const invoiceData = invoice as SaleInvoice;
  let issuer = invoiceData.issuer_snapshot as Partial<IssuerCompany> | null;
  if (invoiceData.issuer_company_id && !issuer) {
    const { data: co, error } = await supabase.from('issuer_companies').select('*').eq('id', invoiceData.issuer_company_id).single();
    if (error) throw error;
    issuer = (co as IssuerCompany) ?? null;
  } else if (invoiceData.issuer_company_id && issuer && !issuer.logo_url) {
    const { data: companyLogo, error } = await supabase
      .from('issuer_companies')
      .select('logo_url')
      .eq('id', invoiceData.issuer_company_id)
      .single();
    if (error) throw error;
    if (companyLogo?.logo_url) issuer = { ...issuer, logo_url: companyLogo.logo_url };
  }

  return (
    <InvoiceView
      invoice={invoiceData}
      items={(items ?? []) as SaleInvoiceItem[]}
      payments={(payments ?? []) as PaymentReceipt[]}
      issuer={issuer ?? {}}
    />
  );
}
