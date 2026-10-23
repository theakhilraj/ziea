// Shared types for the Sales Invoices (GST billing) module. Mirrors the columns
// in Supabase_Queries/SalesInvoices.sql.

/** An issuer company profile ("Client Information") — the party that ISSUES an
 *  invoice (Ziea or any other company). One profile can be `is_default`, which
 *  pre-fills every new invoice. */
export interface IssuerCompany {
  id: string;
  name: string;
  logo_url: string | null;
  logo_width: number | null;
  logo_height: number | null;
  gstin: string | null;
  pan: string | null;
  state: string | null;
  state_code: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  invoice_prefix: string | null;
  terms_title: string | null;
  terms_detail: string | null;
  signatory: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** A recurring customer (bill-to party). Reused across invoices via a picker. */
export interface BillingParty {
  id: string;
  name: string;
  address: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  pan: string | null;
  place_of_supply: string | null;
  state_code: string | null;
  ship_to: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/** A product row surfaced to the invoice line-item picker. */
export interface BillingProduct {
  id: string;
  name: string;
  product_code: string | null;
  hsn_sac: string | null;
  gst_rate: number | null;
  uom: string | null;
  price: number | null;
}

/** A saved invoice header (row of sale_invoices). */
export interface SaleInvoice {
  id: string;
  issuer_company_id: string;
  billing_party_id: string | null;
  invoice_prefix: string | null;
  financial_year: string;
  invoice_seq: number;
  invoice_no: string;
  invoice_date: string;
  due_date: string | null;
  party_name: string;
  party_address: string | null;
  party_gstin: string | null;
  party_phone: string | null;
  party_contact: string | null;
  place_of_supply: string | null;
  party_state_code: string | null;
  ship_to: string | null;
  invoice_type: string | null;
  delivery_mode: string | null;
  reverse_charge: boolean;
  tax_type: 'intra' | 'inter';
  subtotal: number;
  additional_charge: number;
  total_taxable: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  total_tax: number;
  round_off: number;
  grand_total: number;
  amount_in_words: string | null;
  payment_type: string | null;
  amount_paid: number;
  outstanding: number;
  terms_title: string | null;
  terms_detail: string | null;
  document_note: string | null;
  status: 'draft' | 'saved' | 'cancelled';
  pdf_url: string | null;
  issuer_snapshot: Partial<IssuerCompany> | null;
  created_at: string;
  updated_at: string;
}

/** A saved invoice line (row of sale_invoice_items). */
export interface SaleInvoiceItem {
  id: string;
  invoice_id: string;
  line_no: number;
  product_id: string | null;
  name: string;
  hsn_sac: string | null;
  uom: string | null;
  qty: number;
  unit_price: number;
  discount_type: 'amount' | 'percent';
  discount_value: number;
  gst_rate: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  line_total: number;
}

/** A payment recorded against an invoice. */
export interface PaymentReceipt {
  id: string;
  invoice_id: string;
  payment_date: string;
  payment_type: string;
  amount: number;
  note: string | null;
  attachment_url: string | null;
  created_at: string;
}

export const RECEIPT_TYPES = ['CASH', 'CHEQUE', 'ONLINE', 'BANK', 'TDS', 'Bad Debts / Kasar'];

export type TaxType = 'intra' | 'inter';
export type DiscountType = 'amount' | 'percent';
export type PaymentType = 'CREDIT' | 'CASH' | 'CHEQUE' | 'ONLINE' | 'BANK';

/** A single editable line in the invoice form. Numeric inputs allow '' so a field
 *  can be cleared without snapping to 0 while typing. */
export interface InvoiceLineDraft {
  key: string;               // stable client-side row key (not persisted)
  product_id: string | null; // null = ad-hoc item
  name: string;
  hsn_sac: string;
  uom: string;
  qty: string;               // raw input; parsed by the GST engine
  unit_price: string;
  discount_type: DiscountType;
  discount_value: string;
  gst_rate: number;
  note: string;
}

// ── Option lists (mirror GoGST) ──────────────────────────────────────────────
export const GST_RATES = [0, 0.1, 0.25, 0.5, 1, 1.5, 2.5, 3, 5, 6, 7.5, 12, 18, 28, 40];
export const UOM_OPTIONS = ['PCS', 'NOS', 'MTR', 'KG', 'GM', 'SET', 'PAIR', 'BOX', 'DOZ', 'LTR'];
export const DELIVERY_MODES = [
  'Hand Delivery',
  'Self Pickup / Counter',
  'Courier',
  'Local Delivery',
  'Transport / Road',
  'Air',
];
export const INVOICE_TYPES = ['Tax Invoice', 'Bill of Supply', 'Proforma Invoice'];
export const PAYMENT_TYPES: PaymentType[] = ['CREDIT', 'CASH', 'CHEQUE', 'ONLINE', 'BANK'];
