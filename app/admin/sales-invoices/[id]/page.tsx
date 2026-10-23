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

  // Prefer the frozen snapshot; fall back to the live company for pre-snapshot invoices.
  let issuer = (invoice as SaleInvoice).issuer_snapshot as Partial<IssuerCompany> | null;
  if (!issuer && invoice.issuer_company_id) {
    const { data: co } = await supabase.from('issuer_companies').select('*').eq('id', invoice.issuer_company_id).single();
    issuer = (co as IssuerCompany) ?? null;
  }

  return (
    <InvoiceView
      invoice={invoice as SaleInvoice}
      items={(items ?? []) as SaleInvoiceItem[]}
      payments={(payments ?? []) as PaymentReceipt[]}
      issuer={issuer ?? {}}
    />
  );
}
