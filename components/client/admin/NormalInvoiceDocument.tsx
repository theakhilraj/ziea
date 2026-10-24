import type { SaleInvoice, SaleInvoiceItem, IssuerCompany } from "@/utils/billing";
import { resolveImageUrl } from "@/utils/image-url";

const inr = (value: number | string | null | undefined) =>
  Number(value ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const formatDate = (date?: string | null) => {
  if (!date) return "";
  const [year, month, day] = date.split("-");
  return `${day}-${MONTHS[Number(month) - 1] ?? month}-${year}`;
};
export default function NormalInvoiceDocument({
  invoice,
  items,
  issuer,
}: {
  invoice: SaleInvoice;
  items: SaleInvoiceItem[];
  issuer: Partial<IssuerCompany>;
}) {
  return (
    <div className="invoice-print bg-white px-5 pb-6 pt-2 text-[12px] leading-relaxed text-[#1a1a1a] shadow-sm sm:px-8 sm:pb-8 sm:pt-3">
      <header className="flex flex-row items-center justify-between gap-6 px-4 pb-2 pt-1">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {issuer.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={issuer.logo_url}
              alt={`${issuer.name || "Company"} logo`}
              className="h-28 w-28 shrink-0 object-contain"
              onError={(event) => {
                const image = event.currentTarget;
                if (image.dataset.cdnFallback || !issuer.logo_url?.startsWith("/cdn/")) {
                  image.hidden = true;
                } else {
                  image.dataset.cdnFallback = "true";
                  image.src = resolveImageUrl(issuer.logo_url);
                }
              }}
            />
          ) : null}
          <div className="min-w-0">
            <h1 className="break-words text-xl font-bold text-[#111]">{issuer.name}</h1>
            {issuer.address && <p className="max-w-md whitespace-pre-line break-words text-gray-700">{issuer.address}</p>}
          </div>
        </div>
        <div className="shrink-0 text-left leading-relaxed text-gray-700">
          {(issuer.signatory || issuer.name) && (
            <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-1">
              <span className="font-medium text-[#111]">Name</span><span className="break-words">: {issuer.signatory || issuer.name}</span>
            </div>
          )}
          {issuer.phone && (
            <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-1">
              <span className="font-medium text-[#111]">Phone</span><span className="break-words">: {issuer.phone}</span>
            </div>
          )}
          {issuer.email && (
            <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-1">
              <span className="font-medium text-[#111]">Email</span><span className="break-all">: {issuer.email}</span>
            </div>
          )}
        </div>
      </header>

      <section className="mb-5 grid grid-cols-2 gap-4">
        <div className="min-w-0 break-words">
          <h2 className="mb-1 text-[10px] font-bold uppercase tracking-widest text-gray-600">Issued to</h2>
          <p className="font-semibold">{invoice.party_name}</p>
          {invoice.party_address && <p className="whitespace-pre-line">{invoice.party_address}</p>}
          {invoice.party_phone && <p>{invoice.party_phone}</p>}
          {invoice.party_email && <p className="break-all">{invoice.party_email}</p>}
        </div>
        <div className="min-w-0 break-words text-right">
          <p className="text-gray-600">Invoice No.</p>
          <p className="font-semibold">{invoice.invoice_no}</p>
          <p className="mt-2 text-gray-600">Invoice Date</p>
          <p className="font-semibold">{formatDate(invoice.invoice_date)}</p>
        </div>
      </section>

      <table className="w-full table-fixed border-collapse">
        <thead>
          <tr className="border-y border-gray-500 text-left text-[10px] font-bold uppercase tracking-wider">
            <th className="py-2 pr-2">Description</th>
            <th className="w-28 px-2 py-2 text-right">Unit price</th>
            <th className="w-16 px-2 py-2 text-right">Qty</th>
            <th className="w-28 px-2 py-2 text-right">Item discount</th>
            <th className="w-28 py-2 pl-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-gray-300">
              <td className="break-words py-2.5 pr-2">{item.name}</td>
              <td className="px-2 py-2.5 text-right tabular-nums">{inr(item.unit_price)}</td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                {Number(item.qty).toLocaleString("en-IN", { maximumFractionDigits: 3 })}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">
                {Number(item.discount_value) > 0
                  ? item.discount_type === "percent"
                    ? `${inr(item.discount_value)}%`
                    : `₹${inr(item.discount_value)}`
                  : "—"}
              </td>
              <td className="py-2.5 pl-2 text-right tabular-nums">{inr(item.line_total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-500 font-bold">
            <td colSpan={4} className="py-3 pr-2 text-right uppercase tracking-wider">Total</td>
            <td className="py-3 pl-2 text-right tabular-nums">₹{inr(invoice.grand_total)}</td>
          </tr>
        </tfoot>
      </table>

      {(issuer.bank_name || issuer.bank_account_name || issuer.bank_account_number || issuer.bank_ifsc) && (
        <section className="mt-8 border-t border-gray-300 pt-4">
          <h2 className="mb-1 text-[10px] font-bold uppercase tracking-widest">Bank details</h2>
          {issuer.bank_name && <p>{issuer.bank_name}{issuer.bank_branch ? ` · ${issuer.bank_branch}` : ""}</p>}
          {issuer.bank_account_name && <p>Account name: {issuer.bank_account_name}</p>}
          {issuer.bank_account_number && <p>Account no.: {issuer.bank_account_number}</p>}
          {issuer.bank_ifsc && <p>IFSC: {issuer.bank_ifsc}</p>}
        </section>
      )}
    </div>
  );
}
