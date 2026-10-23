// Pure GST math for the Sales Invoices module. No React, no I/O — the UI renders
// exactly what these functions return, and the same values are persisted, so the
// printed invoice always reconciles with the database.

import type { TaxType, DiscountType, InvoiceLineDraft } from '@/utils/billing';

/** Round to 2 decimals, avoiding binary-float drift (e.g. 1.005 → 1.01). */
export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Indian financial year (Apr–Mar) from a "YYYY-MM-DD" date → e.g. "26-27".
 *  Mirrors the DB's gst_financial_year(); no external API needed. */
export function financialYear(dateISO: string): string {
  const [y, m] = dateISO.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  const p2 = (n: number) => String(n % 100).padStart(2, '0');
  return `${p2(start)}-${p2(start + 1)}`;
}

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

/** Intra-state (issuer state == place of supply) → CGST+SGST; else IGST.
 *  Compares 2-digit GST state codes; falls back to 'intra' when unknown. */
export function resolveTaxType(issuerStateCode?: string | null, partyStateCode?: string | null): TaxType {
  const a = (issuerStateCode ?? '').trim();
  const b = (partyStateCode ?? '').trim();
  if (!a || !b) return 'intra';
  return a === b ? 'intra' : 'inter';
}

export interface LineAmounts {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  lineTotal: number;
}

/** Per-line amounts from qty × price, discount (₹ or %), and GST rate. */
export function computeLine(
  line: { qty: number | string; unit_price: number | string; discount_type: DiscountType; discount_value: number | string; gst_rate: number },
  taxType: TaxType,
): LineAmounts {
  const gross = num(line.qty) * num(line.unit_price);
  const discount = line.discount_type === 'percent' ? (gross * num(line.discount_value)) / 100 : num(line.discount_value);
  const taxable = round2(Math.max(gross - discount, 0));
  const tax = round2((taxable * num(line.gst_rate)) / 100);
  const half = round2(tax / 2);
  const cgst = taxType === 'intra' ? half : 0;
  // Give any half-rounding remainder to SGST so cgst + sgst === tax exactly.
  const sgst = taxType === 'intra' ? round2(tax - half) : 0;
  const igst = taxType === 'inter' ? tax : 0;
  return { taxable, cgst, sgst, igst, tax, lineTotal: round2(taxable + tax) };
}

export interface InvoiceTotals {
  subtotal: number;        // Σ line taxable
  additionalCharge: number;
  totalTaxable: number;    // subtotal (additional charge is a flat, untaxed add-on)
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  totalTax: number;
  roundOff: number;        // signed adjustment applied to reach grandTotal
  grandTotal: number;
  amountInWords: string;
}

/** Roll up all lines + optional flat additional charge + round-off. */
export function computeInvoice(
  lines: Array<Pick<InvoiceLineDraft, 'qty' | 'unit_price' | 'discount_type' | 'discount_value' | 'gst_rate'>>,
  opts: { taxType: TaxType; additionalCharge?: number | string; roundOff?: boolean },
): InvoiceTotals {
  const taxType = opts.taxType;
  let subtotal = 0, cgstTotal = 0, sgstTotal = 0, igstTotal = 0;
  for (const l of lines) {
    const a = computeLine(l, taxType);
    subtotal = round2(subtotal + a.taxable);
    cgstTotal = round2(cgstTotal + a.cgst);
    sgstTotal = round2(sgstTotal + a.sgst);
    igstTotal = round2(igstTotal + a.igst);
  }
  const additionalCharge = round2(num(opts.additionalCharge));
  const totalTax = round2(cgstTotal + sgstTotal + igstTotal);
  const preRound = round2(subtotal + additionalCharge + totalTax);
  const grandTotal = opts.roundOff ? Math.round(preRound) : preRound;
  const roundOff = round2(grandTotal - preRound);
  return {
    subtotal,
    additionalCharge,
    totalTaxable: subtotal,
    cgstTotal,
    sgstTotal,
    igstTotal,
    totalTax,
    roundOff,
    grandTotal: round2(grandTotal),
    amountInWords: amountInWords(grandTotal),
  };
}

// ── Amount in words (Indian system: Crore / Lakh / Thousand) ─────────────────
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  let s = h ? `${ONES[h]} Hundred` : '';
  if (rest) {
    if (h) s += ' and ';
    s += rest > 19 ? `${TENS[Math.floor(rest / 10)]}${rest % 10 ? ` ${ONES[rest % 10]}` : ''}` : ONES[rest];
  }
  return s.trim();
}

/** "4916.00" → "Four Thousand Nine Hundred Sixteen Rupees Only". */
export function amountInWords(amount: number): string {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';

  let n = rupees;
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  const hundred = n;

  let w = '';
  if (crore) w += `${below1000(crore)} Crore `;
  if (lakh) w += `${below1000(lakh)} Lakh `;
  if (thousand) w += `${below1000(thousand)} Thousand `;
  if (hundred) w += `${below1000(hundred)} `;
  w = w.trim();

  let out = w ? `${w} Rupees` : 'Rupees';
  if (paise > 0) out += ` and ${below1000(paise)} Paise`;
  return `${out} Only`;
}
