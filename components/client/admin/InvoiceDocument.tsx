import type { SaleInvoice, SaleInvoiceItem, IssuerCompany } from '@/utils/billing';
import { resolveImageUrl } from '@/utils/image-url';

const inr = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (iso?: string | null) => {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}-${MONTHS[Number(m) - 1] ?? m}-${y}`;
};

const B = 'border border-gray-400';
const RATE_CELL = B;

function KV({ label, value, bold, multiline }: { label: string; value?: string | null; bold?: boolean; multiline?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <span className="font-semibold w-24 shrink-0">{label}</span>
      {/* Address wraps freely and is capped at 4 lines so a long address never
          blows up the row height. */}
      <span className={`flex-1 break-words ${bold ? 'font-semibold' : ''} ${multiline ? 'whitespace-pre-line line-clamp-4' : ''}`}>{value}</span>
    </div>
  );
}
function Meta({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-600">{label}</span>
      <span className="font-semibold text-right">{value}</span>
    </div>
  );
}
function TotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between px-3 ${bold ? 'py-1.5 font-bold bg-gray-100' : 'py-1'} border-b border-gray-300`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/** GST tax-invoice document, matching the GoGST print layout. Issuer data comes
 *  from the frozen snapshot; presentational only (reused for screen + print). */
export default function InvoiceDocument({ invoice, items, issuer, copyLabel = 'ORIGINAL FOR RECIPIENT' }: {
  invoice: SaleInvoice;
  items: SaleInvoiceItem[];
  issuer: Partial<IssuerCompany>;
  copyLabel?: string;
}) {
  const intra = invoice.tax_type === 'intra';
  const totalQty = items.reduce((s, it) => s + Number(it.qty), 0);
  const totalDisc = items.reduce((s, it) => s + Math.max(Number(it.qty) * Number(it.unit_price) - Number(it.taxable_amount), 0), 0);

  return (
    <div className="invoice-print bg-white text-[#1a1a1a] text-[12px] leading-tight shadow-sm">
      {/* Header — brand + address on the left, contact block on the right (outside the box) */}
      <div className="flex flex-row justify-between items-center gap-6 px-4 pt-6 pb-2">
        <div className="flex items-center gap-3 min-w-0">
          {issuer.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={issuer.logo_url}
              alt={`${issuer.name || 'Company'} logo`}
              className="h-28 w-28 object-contain shrink-0"
              onError={(event) => {
                const image = event.currentTarget;
                if (
                  !image.dataset.cdnFallback &&
                  issuer.logo_url?.startsWith('/cdn/') &&
                  resolveImageUrl(issuer.logo_url) !== issuer.logo_url
                ) {
                  image.dataset.cdnFallback = 'true';
                  image.src = resolveImageUrl(issuer.logo_url);
                } else {
                  image.hidden = true;
                }
              }}
            />
          ) : null}
          <div className="min-w-0">
            <div className="text-xl font-bold text-[#111]">{issuer.name}</div>
            {issuer.address ? <div className="text-gray-700 whitespace-pre-line break-words max-w-md">{issuer.address}</div> : null}
          </div>
        </div>
        <div className="text-left text-gray-700 shrink-0 leading-relaxed">
          {(issuer.signatory || issuer.name) ? (
            <div className="grid grid-cols-[3.5rem_auto] gap-x-1">
              <span className="font-medium text-[#111]">Name</span><span>: {issuer.signatory || issuer.name}</span>
            </div>
          ) : null}
          {issuer.phone ? (
            <div className="grid grid-cols-[3.5rem_auto] gap-x-1">
              <span className="font-medium text-[#111]">Phone</span><span>: {issuer.phone}</span>
            </div>
          ) : null}
          {issuer.email ? (
            <div className="grid grid-cols-[3.5rem_auto] gap-x-1">
              <span className="font-medium text-[#111]">Email</span><span className="break-all">: {issuer.email}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Keep the invoice content inset without an outer decorative frame. */}
      <div className="px-3 pt-1 pb-3">
      <div className="border border-gray-400">
      {/* GSTIN band — the invoice type is centered across the full width. */}
      <div className="relative grid grid-cols-2 border-b border-gray-400 min-h-[40px]">
        <div className="px-3 py-2 font-semibold self-center">GSTIN : {issuer.gstin || '-'}</div>
        <div className="px-3 py-2 text-right text-[11px] font-semibold self-center">{copyLabel}</div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="font-bold text-[15px] leading-none uppercase">{invoice.invoice_type || 'Tax Invoice'}</span>
        </div>
      </div>

      {/* Customer + meta */}
      <div className="grid grid-cols-2 border-b border-gray-400" style={{ gridTemplateColumns: '50% 50%' }}>
        <div className="border-r border-gray-400">
          <div className="font-semibold leading-normal text-center border-b border-gray-400 py-1.5 bg-gray-50">Customer Detail</div>
          <div className="p-3 space-y-0.5">
            <KV label="Name" value={invoice.party_name} bold />
            <KV label="Address" value={invoice.party_address} multiline />
            <KV label="Phone" value={invoice.party_phone} />
            <KV label="GSTIN" value={invoice.party_gstin || '-'} />
            <KV label="Place of Supply" value={invoice.place_of_supply} />
          </div>
        </div>
        <div className="p-3 space-y-1">
          <Meta label="Invoice No." value={invoice.invoice_no} />
          <Meta label="Invoice Date" value={fmt(invoice.invoice_date)} />
          <Meta label="Due Date" value={invoice.due_date ? fmt(invoice.due_date) : null} />
          <Meta label="Delivery" value={invoice.delivery_mode} />
          {invoice.reverse_charge ? <Meta label="Reverse Charge" value="Yes" /> : null}
        </div>
      </div>

      {/* Items */}
      <div className="overflow-x-auto inv-scroll">
        <table className="w-full table-fixed border-collapse text-[11px]">
          <colgroup>
            <col style={{ width: '4%' }} />
            <col style={{ width: '22%' }} />
            <col style={{ width: '8%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '9%' }} />
            {intra ? (
              <>
                <col style={{ width: '9%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '10%' }} />
                <col style={{ width: '11%' }} />
              </>
            ) : (
              <>
                <col style={{ width: '9%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '17%' }} />
                <col style={{ width: '13%' }} />
              </>
            )}
          </colgroup>
          <thead>
            <tr className="bg-gray-100 text-center">
              <th className={`${B} px-1 py-1.5`}>Sr</th>
              <th className={`${B} px-2 py-1.5 text-left`}>Name of Product / Service</th>
              <th className={`${B} px-1 py-1.5`}>HSN/SAC</th>
              <th className={`${B} px-1 py-1.5`}>Qty</th>
              <th className={`${RATE_CELL} px-1 py-1.5`}>Rate</th>
              <th className={`${B} px-1 py-1.5`}>Disc (₹)</th>
              <th className={`${B} px-1 py-1.5`}>Taxable</th>
              {intra ? (
                <>
                  <th className={`${B} px-1 py-1.5`}>CGST</th>
                  <th className={`${B} px-1 py-1.5`}>SGST</th>
                </>
              ) : (
                <th className={`${B} px-1 py-1.5`}>IGST</th>
              )}
              <th className={`${B} px-1 py-1.5`}>Total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const disc = Math.max(Number(it.qty) * Number(it.unit_price) - Number(it.taxable_amount), 0);
              const half = Number(it.gst_rate) / 2;
              return (
                <tr key={it.id} className="text-center align-top">
                  <td className={`${B} px-1 py-1.5`}>{i + 1}</td>
                  <td className={`${B} px-2 py-1.5 text-left`}>
                    <div className="font-semibold">{it.name}</div>
                  </td>
                  <td className={`${B} px-1 py-1.5`}>{it.hsn_sac || '-'}</td>
                  <td className={`${B} px-1 py-1.5 whitespace-nowrap`}>{Number(it.qty)} {it.uom || ''}</td>
                  <td className={`${RATE_CELL} px-1 py-1.5 text-center`}>{inr(it.unit_price)}</td>
                  <td className={`${B} px-1 py-1.5 text-center`}>{inr(disc)}</td>
                  <td className={`${B} px-1 py-1.5 text-center`}>{inr(it.taxable_amount)}</td>
                  {intra ? (
                    <>
                      <td className={`${B} px-1 py-1.5 text-center whitespace-nowrap`}>{half}%<br />{inr(it.cgst_amount)}</td>
                      <td className={`${B} px-1 py-1.5 text-center whitespace-nowrap`}>{half}%<br />{inr(it.sgst_amount)}</td>
                    </>
                  ) : (
                    <td className={`${B} px-1 py-1.5 text-center whitespace-nowrap`}>{Number(it.gst_rate)}%<br />{inr(it.igst_amount)}</td>
                  )}
                  <td className={`${B} px-1 py-1.5 text-center font-semibold`}>{inr(it.line_total)}</td>
                </tr>
              );
            })}
            <tr className="bg-gray-50 font-semibold text-center">
              <td className={`${B} px-1 py-1.5`} colSpan={3}>Total</td>
              <td className={`${B} px-1 py-1.5`}>{totalQty}</td>
              <td className={`${RATE_CELL} px-1 py-1.5`}></td>
              <td className={`${B} px-1 py-1.5 text-center`}>{inr(totalDisc)}</td>
              <td className={`${B} px-1 py-1.5 text-center`}>{inr(invoice.subtotal)}</td>
              {intra ? (
                <>
                  <td className={`${B} px-1 py-1.5 text-center`}>{inr(invoice.cgst_total)}</td>
                  <td className={`${B} px-1 py-1.5 text-center`}>{inr(invoice.sgst_total)}</td>
                </>
              ) : (
                <td className={`${B} px-1 py-1.5 text-center`}>{inr(invoice.igst_total)}</td>
              )}
              <td className={`${B} px-1 py-1.5 text-center`}>{inr(invoice.grand_total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Totals + words */}
      <div className="grid grid-cols-2 border-b border-gray-400" style={{ gridTemplateColumns: '50% 50%' }}>
        <div className="border-r border-gray-400 p-3">
          <div className="font-semibold mb-1">Total in words</div>
          <div className="uppercase">{invoice.amount_in_words}</div>
        </div>
        <div>
          <TotalRow label="Taxable Amount" value={inr(invoice.total_taxable)} />
          {Number(invoice.additional_charge) ? <TotalRow label="Additional Charge" value={inr(invoice.additional_charge)} /> : null}
          {intra ? (
            <>
              <TotalRow label="Add : CGST" value={inr(invoice.cgst_total)} />
              <TotalRow label="Add : SGST" value={inr(invoice.sgst_total)} />
            </>
          ) : (
            <TotalRow label="Add : IGST" value={inr(invoice.igst_total)} />
          )}
          <TotalRow label="Total Tax" value={inr(invoice.total_tax)} />
          {Number(invoice.round_off) ? <TotalRow label="Round Off" value={inr(invoice.round_off)} /> : null}
          <TotalRow label="Total Amount After Tax" value={`₹${inr(invoice.grand_total)}`} bold />
          <div className="text-right px-3 py-1 text-[11px] text-gray-500">(E &amp; O.E.)</div>
        </div>
      </div>

      {/* Bank + signatory */}
      <div className="grid grid-cols-2 border-b border-gray-400" style={{ gridTemplateColumns: '50% 50%' }}>
        <div className="border-r border-gray-400">
          <div className="font-semibold leading-normal text-center border-b border-gray-400 py-1.5 bg-gray-50">Bank Details</div>
          <div className="p-3 space-y-0.5">
            <KV label="Name" value={issuer.bank_name} />
            <KV label="Branch" value={issuer.bank_branch} />
            <KV label="Acc. Name" value={issuer.bank_account_name} />
            <KV label="Acc. Number" value={issuer.bank_account_number} />
            <KV label="IFSC" value={issuer.bank_ifsc} />
          </div>
        </div>
        <div className="p-3 flex flex-col text-center">
          <div className="text-[11px]">Certified that the particulars given above are true and correct.</div>
          <div className="font-bold mt-1">For {issuer.name}</div>
          <div className="mt-auto pt-12 text-[11px]">{issuer.signatory || 'Authorised Signatory'}</div>
        </div>
      </div>

      {/* Terms */}
      {(invoice.terms_title || invoice.terms_detail) ? (
        <div className="p-3">
          <div className="font-semibold">{invoice.terms_title || 'Terms and Conditions'}</div>
          {invoice.terms_detail ? <div className="whitespace-pre-line text-gray-700 mt-0.5">{invoice.terms_detail}</div> : null}
        </div>
      ) : null}
      </div>
      </div>
    </div>
  );
}
