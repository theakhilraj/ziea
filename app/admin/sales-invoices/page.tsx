import Link from 'next/link';
import { MdOutlineReceiptLong } from 'react-icons/md';
import { Card } from '@/components/ui/Card';
import { AnalyticsPagination } from '@/components/ui/AnalyticsPagination';
import { buttonBase, buttonVariants } from '@/components/ui/Button';
import { createClient } from '@/utils/supabase/server';

export const metadata = {
  title: 'Sales Invoices',
  robots: { index: false },
};

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;
const COLUMNS = ['Invoice No', 'Company Name', 'Invoice Date', 'Total', 'Payment Type', 'Outstanding', 'Action'];

const primaryLink = `${buttonBase} ${buttonVariants['auth-primary']} !w-auto !py-3 px-6 !text-sm`;
const secondaryLink = `${buttonBase} ${buttonVariants['auth-social']} !w-auto !py-3 px-5 !text-sm`;

const inr = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) => {
  const [y, m, day] = d.split('-');
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1] ?? m;
  return `${day}-${mon}-${y.slice(2)}`;
};
const payColor: Record<string, string> = {
  CREDIT: 'bg-amber-100 text-amber-700',
  CASH: 'bg-[#7A9268]/15 text-[#4b6138]',
  ONLINE: 'bg-[#7A9268]/15 text-[#4b6138]',
  BANK: 'bg-[#7A9268]/15 text-[#4b6138]',
  CHEQUE: 'bg-blue-100 text-blue-700',
};

interface InvoiceRow {
  id: string;
  invoice_no: string;
  party_name: string;
  invoice_date: string;
  grand_total: number;
  payment_type: string | null;
  outstanding: number;
  status: string;
}

export default async function SalesInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;
  const requestedPage = Number(params.page);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const [invRes, companyCountRes] = await Promise.all([
    supabase
      .from('sale_invoices')
      .select('id, invoice_no, party_name, invoice_date, grand_total, payment_type, outstanding, status', { count: 'exact' })
      .order('invoice_date', { ascending: false })
      .order('created_at', { ascending: false })
      .range(from, to),
    supabase.from('issuer_companies').select('*', { count: 'exact', head: true }),
  ]);
  const invoices = (invRes.data ?? []) as InvoiceRow[];
  const totalPages = Math.max(1, Math.ceil((invRes.count ?? 0) / PAGE_SIZE));

  // Constraint: an invoice needs an issuer company. Without one, steer the CTA to
  // Company Settings instead of the (guarded) create page.
  const hasCompany = (companyCountRes.count ?? 0) > 0;
  const ctaHref = hasCompany ? '/admin/sales-invoices/new' : '/admin/sales-invoices/settings';
  const ctaLabel = hasCompany ? 'New Invoice' : 'Add a Company First';

  return (
    <main className="pt-20 lg:pt-6 px-6 lg:px-10 max-w-7xl mx-auto pb-6 lg:pb-10 min-h-screen">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 lg:gap-0 mb-6 border-b border-[#d6c3b3]/30 pb-5 lg:pb-6">
        <div>
          <h1 className="font-jost text-2xl lg:text-3xl text-[#2C3829] mb-2 font-bold">Sales Invoices</h1>
          <p className="font-body-md lg:font-body-lg text-[#2C3829]/70">Create, store and print GST invoices.</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/sales-invoices/settings" className={secondaryLink}>Company Settings</Link>
          {invoices.length > 0 && (
            <Link href={ctaHref} className={primaryLink}>{ctaLabel}</Link>
          )}
        </div>
      </div>

      {/* Invoices Table */}
      <Card className="border border-[#d6c3b3]/30">
        <div className="space-y-3 p-3 md:hidden">
          {invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-12 px-6">
              <MdOutlineReceiptLong className="text-4xl text-[#7A9268] mb-3" />
              <h3 className="font-jost text-lg font-semibold text-[#2C3829] mb-1">No invoices yet</h3>
              <p className="font-body-md text-sm text-[#2C3829]/60 mb-5">
                {hasCompany
                  ? 'Create your first GST invoice — it will appear here, ready to view, edit, download or cancel.'
                  : 'First add a company profile (logo, GSTIN, bank) — every invoice is issued from one. Then you can create invoices.'}
              </p>
              <Link href={ctaHref} className={primaryLink}>{ctaLabel}</Link>
            </div>
          ) : invoices.map((inv) => (
            <Link key={inv.id} href={`/admin/sales-invoices/${inv.id}`} className="block">
              <Card className={`!rounded-xl !p-0 border border-[#d6c3b3]/30 ${inv.status === 'cancelled' ? 'opacity-50' : ''}`}>
                <div className="grid grid-cols-2 gap-3 border-b border-[#d6c3b3]/20 bg-[#F5F0E8]/50 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#2C3829]/50">Invoice No.</p>
                    <p className="mt-1 truncate font-jost font-semibold text-[#2C3829]">{inv.invoice_no}</p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[#2C3829]/50">Customer</p>
                    <p className="mt-1 truncate text-sm text-[#2C3829]">{inv.party_name}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-3 px-4 py-3 text-sm">
                  <div>
                    <p className="text-xs text-[#2C3829]/50">Invoice Date</p>
                    <p className="mt-0.5 text-[#2C3829]">{fmtDate(inv.invoice_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#2C3829]/50">Total</p>
                    <p className="mt-0.5 font-medium tabular-nums text-[#2C3829]">₹{inr(inv.grand_total)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#2C3829]/50">Payment Type</p>
                    {inv.payment_type ? (
                      <span className={`mt-1 inline-flex text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${payColor[inv.payment_type] ?? 'bg-gray-100 text-gray-600'}`}>
                        {inv.payment_type}
                      </span>
                    ) : <p className="mt-0.5 text-[#2C3829]/60">—</p>}
                  </div>
                  <div>
                    <p className="text-xs text-[#2C3829]/50">Outstanding</p>
                    <p className="mt-0.5 tabular-nums text-[#2C3829]">{inv.outstanding > 0 ? `₹${inr(inv.outstanding)}` : '—'}</p>
                  </div>
                </div>
                <div className="border-t border-[#d6c3b3]/20 px-4 py-2 text-right text-xs font-medium text-[#4b6138]">
                  View invoice →
                </div>
              </Card>
            </Link>
          ))}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#d6c3b3]/30 bg-[#F5F0E8]/60">
                {COLUMNS.map((col) => (
                  <th key={col} className="px-5 py-3.5 font-jost text-xs font-semibold uppercase tracking-wider text-[#2C3829]/60 whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length}>
                    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
                      <div className="w-16 h-16 rounded-full bg-[#F5F0E8] flex items-center justify-center mb-4">
                        <MdOutlineReceiptLong className="text-3xl text-[#7A9268]" />
                      </div>
                      <h3 className="font-jost text-lg font-semibold text-[#2C3829] mb-1">No invoices yet</h3>
                      <p className="font-body-md text-[#2C3829]/60 mb-6 max-w-sm">
                        {hasCompany
                          ? 'Create your first GST invoice — it will appear here, ready to view, edit, print or cancel.'
                          : 'First add a company profile (logo, GSTIN, bank) — every invoice is issued from one. Then you can create invoices.'}
                      </p>
                      <Link href={ctaHref} className={primaryLink}>{ctaLabel}</Link>
                    </div>
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className={`border-b border-[#d6c3b3]/20 last:border-0 hover:bg-[#F5F0E8]/40 ${inv.status === 'cancelled' ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-3.5 font-jost font-medium text-[#2C3829] whitespace-nowrap">{inv.invoice_no}</td>
                    <td className="px-5 py-3.5 text-[#2C3829] max-w-[220px] truncate">{inv.party_name}</td>
                    <td className="px-5 py-3.5 text-[#2C3829]/80 whitespace-nowrap">{fmtDate(inv.invoice_date)}</td>
                    <td className="px-5 py-3.5 text-[#2C3829] tabular-nums whitespace-nowrap">₹{inr(inv.grand_total)}</td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {inv.payment_type && (
                        <span className={`text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-full ${payColor[inv.payment_type] ?? 'bg-gray-100 text-gray-600'}`}>
                          {inv.payment_type}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-[#2C3829]/80 tabular-nums whitespace-nowrap">
                      {inv.outstanding > 0 ? `₹${inr(inv.outstanding)}` : '—'}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <Link href={`/admin/sales-invoices/${inv.id}`}
                        className="text-sm font-medium text-[#4b6138] hover:text-[#2C3829] hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
      <AnalyticsPagination basePath="/admin/sales-invoices" page={page} totalPages={totalPages} />
    </main>
  );
}
