"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MdArrowBack, MdAdd, MdDelete, MdCalendarToday, MdKeyboardArrowDown, MdInfoOutline } from 'react-icons/md';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Calendar } from '@/components/ui/Calendar';
import Toast from '@/components/ui/Toast';
import { createClient } from '@/utils/supabase/client';
import { computeLine, computeInvoice, resolveTaxType, financialYear } from '@/utils/gst';
import {
  GST_RATES, UOM_OPTIONS, DELIVERY_MODES, INVOICE_TYPES, PAYMENT_TYPES,
  type IssuerCompany, type BillingParty, type BillingProduct, type InvoiceLineDraft, type PaymentType,
  type SaleInvoice, type SaleInvoiceItem,
} from '@/utils/billing';

const LIST_PATH = '/admin/sales-invoices';

// Standard GST terms pre-filled on a new invoice (the company's own saved terms,
// if any, take precedence). Editable per-invoice before saving.
const DEFAULT_TERMS = [
  'Subject to our home Jurisdiction.',
  'Our Responsibility Ceases as soon as goods leaves our Premises.',
  'Goods once sold will not be taken back.',
  'Delivery Ex-Premises.',
].join('\n');

const FIELD_CLS =
  'w-full px-4 py-3 bg-white rounded-xl font-jost text-base text-[#2C3829] transition-all outline-none focus:ring-4 focus:ring-primary/5 duration-200';
const CELL_CLS =
  'w-full px-2.5 py-2 bg-white rounded-lg font-jost text-sm text-[#2C3829] outline-none focus:ring-2 focus:ring-primary/10';
const LABEL_CLS = 'font-jost text-sm font-medium text-[#2C3829] mb-1 block';
const bcls = (e?: boolean) => (e ? 'border border-red-400 focus:border-red-500' : 'border border-[#d6c3b3] focus:border-primary hover:border-primary/50');

function Field({ label, value, onChange, placeholder, error, inputMode, maxLength }: {
  label?: string; value: string; onChange: (v: string) => void; placeholder?: string;
  error?: string; inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; maxLength?: number;
}) {
  return (
    <div>
      {label && <label className={LABEL_CLS}>{label}</label>}
      <input value={value} placeholder={placeholder} inputMode={inputMode} maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)} className={`${FIELD_CLS} ${bcls(!!error)}`} />
      {error && <p className="text-xs text-red-600 mt-1 ml-1">{error}</p>}
    </div>
  );
}

function TextArea({ label, value, onChange, rows = 2 }: { label?: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      {label && <label className={LABEL_CLS}>{label}</label>}
      <textarea value={value} rows={rows} onChange={(e) => onChange(e.target.value)} className={`${FIELD_CLS} ${bcls(false)} resize-y`} />
    </div>
  );
}

const inr = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const todayISO = () => new Date().toISOString().slice(0, 10);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtLong = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}-${MONTHS[Number(m) - 1]}-${y}`; };

/** Date input styled like the shared Select, opening the app's Calendar in a popover. */
function DateField({ label, value, onChange, minISO, maxISO, placeholder = 'Select date' }: {
  label?: string; value: string; onChange: (v: string) => void; minISO: string; maxISO: string; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="relative" ref={ref}>
      {label && <label className={LABEL_CLS}>{label}</label>}
      <div onClick={() => setOpen((o) => !o)}
        className={`${FIELD_CLS} ${bcls(false)} flex justify-between items-center cursor-pointer`}>
        <span className={value ? 'text-[#2C3829]' : 'text-[#2C3829]/50'}>{value ? fmtLong(value) : placeholder}</span>
        <MdCalendarToday className="text-lg text-[#2C3829]/50 shrink-0" />
      </div>
      {open && (
        <div className="absolute z-50 mt-2 w-[300px] max-w-[90vw] bg-white border border-[#d6c3b3]/50 rounded-xl shadow-lg shadow-black/5 p-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <Calendar value={value || null} onChange={(iso) => { onChange(iso); setOpen(false); }} minISO={minISO} maxISO={maxISO} todayISO={todayISO()} />
        </div>
      )}
    </div>
  );
}

const SectionHead = ({ children }: { children: React.ReactNode }) => (
  <h3 className="font-jost text-lg font-semibold text-[#2C3829] border-b border-[#d6c3b3]/30 pb-3">{children}</h3>
);

// Uniform-height row control — every box in the product table uses this so heights match.
const ROW_CTRL =
  'h-10 w-full px-3 bg-white rounded-lg border border-[#d6c3b3] font-jost text-sm text-[#2C3829] outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/10 hover:border-primary/50';

function useOutside(ref: React.RefObject<HTMLElement | null>, onOutside: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onOutside(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, onOutside]);
}

const menuCls = 'absolute z-50 mt-1 max-h-56 overflow-auto bg-white border border-[#d6c3b3]/50 rounded-xl shadow-lg shadow-black/5 py-1';

/** Searchable product picker — filters the catalog as you type, and accepts an
 *  ad-hoc name (not in the catalog) too. Styled like the app, not the native datalist. */
function ProductCombo({ value, products, onType, onPick }: {
  value: string; products: BillingProduct[]; onType: (name: string) => void; onPick: (p: BillingProduct) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  const q = value.trim().toLowerCase();
  const filtered = (q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products).slice(0, 30);
  return (
    <div className="relative" ref={ref}>
      <input value={value} placeholder="Product name" onFocus={() => setOpen(true)}
        onChange={(e) => { onType(e.target.value); setOpen(true); }} className={`${ROW_CTRL} pr-8`} />
      <MdKeyboardArrowDown className="absolute right-2 top-1/2 -translate-y-1/2 text-[#2C3829]/50 pointer-events-none" />
      {open && filtered.length > 0 && (
        <div className={`${menuCls} w-64`}>
          {filtered.map((p) => (
            <button type="button" key={p.id} onClick={() => { onPick(p); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-[#2C3829] hover:bg-[#F5F0E8] flex justify-between gap-2">
              <span className="truncate">{p.name}</span>
              {p.product_code && <span className="text-xs text-[#2C3829]/40 shrink-0">{p.product_code}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Small info icon with a hover tooltip, for explaining a column header. */
function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <MdInfoOutline className="text-[13px] text-[#2C3829]/40 hover:text-[#2C3829]/70 cursor-help" />
      <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 z-[60] hidden group-hover:block w-52 rounded-lg bg-[#2C3829] text-white text-[11px] leading-snug font-normal normal-case tracking-normal px-2.5 py-1.5 shadow-lg">
        {text}
      </span>
    </span>
  );
}

/** Typeable dropdown for a fixed list of strings (UOM) — filter + custom entry. */
function TextCombo({ value, options, onChange, placeholder }: {
  value: string; options: string[]; onChange: (v: string) => void; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  const q = value.trim().toLowerCase();
  const filtered = (q ? options.filter((o) => o.toLowerCase().includes(q)) : options).slice(0, 20);
  return (
    <div className="relative" ref={ref}>
      <input value={value} placeholder={placeholder} onFocus={() => setOpen(true)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }} className={`${ROW_CTRL} pr-8`} />
      <MdKeyboardArrowDown className="absolute right-2 top-1/2 -translate-y-1/2 text-[#2C3829]/50 pointer-events-none" />
      {open && filtered.length > 0 && (
        <div className={`${menuCls} w-full min-w-[90px]`}>
          {filtered.map((o) => (
            <button type="button" key={o} onClick={() => { onChange(o); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-[#F5F0E8] ${o === value ? 'text-[#4b6138] font-semibold' : 'text-[#2C3829]'}`}>{o}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Fixed-list dropdown (GST rate), styled to match the app's Select. */
function RateSelect({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className={`${ROW_CTRL} pr-8 flex items-center justify-between text-left`}>
        <span>{value}</span>
        <MdKeyboardArrowDown className={`absolute right-2 text-[#2C3829]/50 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={`${menuCls} w-full min-w-[76px]`}>
          {GST_RATES.map((r) => (
            <button type="button" key={r} onClick={() => { onChange(r); setOpen(false); }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-[#F5F0E8] ${r === value ? 'text-[#4b6138] font-semibold' : 'text-[#2C3829]'}`}>{r}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Customer name combobox — type a brand-new name, or pick a saved party to auto-fill everything. */
function PartyCombo({ value, parties, onType, onPick }: {
  value: string; parties: BillingParty[]; onType: (name: string) => void; onPick: (p: BillingParty) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOutside(ref, () => setOpen(false));
  const q = value.trim().toLowerCase();
  const filtered = (q ? parties.filter((p) => p.name.toLowerCase().includes(q)) : parties).slice(0, 30);
  return (
    <div className="relative" ref={ref}>
      <input value={value} placeholder="Type customer name…" onFocus={() => setOpen(true)}
        onChange={(e) => { onType(e.target.value); setOpen(true); }} className={`${FIELD_CLS} ${bcls(false)} pr-9`} />
      <MdKeyboardArrowDown className="absolute right-3 top-1/2 -translate-y-1/2 text-[#2C3829]/50 pointer-events-none" />
      {open && filtered.length > 0 && (
        <div className={`${menuCls} w-full`}>
          {filtered.map((p) => (
            <button type="button" key={p.id} onClick={() => { onPick(p); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-[#2C3829] hover:bg-[#F5F0E8]">
              {p.name}{p.gstin ? <span className="text-xs text-[#2C3829]/40"> · {p.gstin}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const emptyLine = (): InvoiceLineDraft => ({
  key: crypto.randomUUID(), product_id: null, name: '', hsn_sac: '', uom: '',
  qty: '', unit_price: '', discount_type: 'amount', discount_value: '', gst_rate: 0, note: '',
});

const emptyCustomer = { name: '', address: '', contact_person: '', phone: '', gstin: '', place_of_supply: '', state_code: '', ship_to: '' };
type Customer = typeof emptyCustomer;

export default function InvoiceForm({ companies, parties, products, initial }: {
  companies: IssuerCompany[];
  parties: BillingParty[];
  products: BillingProduct[];
  initial?: { invoice: SaleInvoice; items: SaleInvoiceItem[] };
}) {
  const router = useRouter();
  const supabase = createClient();
  const isEdit = !!initial;
  const inv = initial?.invoice;

  const year = new Date().getFullYear();
  const MIN_ISO = `${year - 5}-01-01`;
  const MAX_ISO = `${year + 5}-12-31`;

  const defaultCompany = companies.find((c) => c.is_default) ?? companies[0];
  const [issuerId, setIssuerId] = useState(inv?.issuer_company_id ?? defaultCompany.id);
  const issuer = companies.find((c) => c.id === issuerId) ?? defaultCompany;

  const [invoiceType, setInvoiceType] = useState(inv?.invoice_type ?? INVOICE_TYPES[0]);
  const [deliveryMode, setDeliveryMode] = useState(inv?.delivery_mode ?? '');
  const [invoiceDate, setInvoiceDate] = useState(inv?.invoice_date ?? todayISO());
  const [dueDate, setDueDate] = useState(inv?.due_date ?? '');
  const [reverseCharge, setReverseCharge] = useState(inv?.reverse_charge ?? false);
  const [manualNumber, setManualNumber] = useState(false);
  const [customNo, setCustomNo] = useState('');

  const [partyId, setPartyId] = useState(inv?.billing_party_id ?? '');
  const [customer, setCustomer] = useState<Customer>(inv ? {
    name: inv.party_name ?? '', address: inv.party_address ?? '', contact_person: inv.party_contact ?? '',
    phone: inv.party_phone ?? '', gstin: inv.party_gstin ?? '', place_of_supply: inv.place_of_supply ?? '',
    state_code: inv.party_state_code ?? '', ship_to: inv.ship_to ?? '',
  } : emptyCustomer);
  const [saveCustomer, setSaveCustomer] = useState(false);
  const setCust = (patch: Partial<Customer>) => setCustomer((p) => ({ ...p, ...patch }));

  const [lines, setLines] = useState<InvoiceLineDraft[]>(
    initial
      ? initial.items.map((it) => ({
          key: crypto.randomUUID(), product_id: it.product_id, name: it.name, hsn_sac: it.hsn_sac ?? '',
          uom: it.uom ?? '', qty: String(it.qty), unit_price: String(it.unit_price), discount_type: it.discount_type,
          discount_value: Number(it.discount_value) ? String(it.discount_value) : '', gst_rate: Number(it.gst_rate), note: '',
        }))
      : [emptyLine()],
  );
  const [additionalCharge, setAdditionalCharge] = useState(inv && Number(inv.additional_charge) ? String(inv.additional_charge) : '');
  const [roundOff, setRoundOff] = useState(true);
  const [paymentType, setPaymentType] = useState<PaymentType>((inv?.payment_type as PaymentType) ?? 'CREDIT');

  const [termsTitle, setTermsTitle] = useState(inv?.terms_title ?? issuer.terms_title ?? 'Terms and Conditions');
  const [termsDetail, setTermsDetail] = useState(inv?.terms_detail ?? issuer.terms_detail ?? DEFAULT_TERMS);
  const [documentNote, setDocumentNote] = useState(inv?.document_note ?? '');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', show: false, error: false });
  const showToast = (message: string, isError = false) => {
    setToast({ message, show: true, error: isError });
    setTimeout(() => setToast({ message: '', show: false, error: false }), 4000);
  };

  const taxType = resolveTaxType(issuer.state_code, customer.state_code);
  const totals = useMemo(() => computeInvoice(lines, { taxType, additionalCharge, roundOff }), [lines, taxType, additionalCharge, roundOff]);

  // Fixed number segments (prefix from the company, FY from the invoice date).
  const invoicePrefix = issuer.invoice_prefix || 'INV';
  const fy = financialYear(invoiceDate);

  const setLine = (key: string, patch: Partial<InvoiceLineDraft>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (key: string) => setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));

  // Typing: exact-match a catalog product (autofill) else keep it ad-hoc.
  const onNameChange = (key: string, name: string) => {
    const match = products.find((p) => p.name === name);
    if (match) selectProduct(key, match);
    else setLine(key, { name, product_id: null });
  };
  // Explicit pick from the dropdown — full autofill.
  const selectProduct = (key: string, p: BillingProduct) => setLine(key, {
    name: p.name, product_id: p.id, hsn_sac: p.hsn_sac ?? '', uom: p.uom ?? '',
    unit_price: p.price != null ? String(p.price) : '', gst_rate: p.gst_rate ?? 0,
  });

  const onSelectParty = (id: string) => {
    setPartyId(id);
    const p = parties.find((x) => x.id === id);
    setCustomer(p ? {
      name: p.name ?? '', address: p.address ?? '', contact_person: p.contact_person ?? '',
      phone: p.phone ?? '', gstin: p.gstin ?? '', place_of_supply: p.place_of_supply ?? '',
      state_code: p.state_code ?? '', ship_to: p.ship_to ?? '',
    } : emptyCustomer);
  };

  const handleSave = async () => {
    setError('');
    if (!customer.name.trim()) { showToast('Enter the customer (M/S) name.', true); return; }
    if (manualNumber && !customNo.trim()) { showToast('Enter the invoice number, or turn off manual numbering.', true); return; }
    const validLines = lines.filter((l) => l.name.trim() && Number(l.qty) > 0 && Number(l.unit_price) >= 0);
    if (validLines.length === 0) { showToast('Add at least one product line (name, qty, price).', true); return; }

    setIsSubmitting(true);
    try {
      let usePartyId: string | null = partyId || null;

      if (!usePartyId && saveCustomer) {
        const { data, error: pErr } = await supabase
          .from('billing_parties')
          .insert({
            name: customer.name.trim(), address: customer.address.trim() || null,
            contact_person: customer.contact_person.trim() || null, phone: customer.phone.trim() || null,
            gstin: customer.gstin.trim() || null, place_of_supply: customer.place_of_supply.trim() || null,
            state_code: customer.state_code.trim() || null, ship_to: customer.ship_to.trim() || null,
          })
          .select('id').single();
        if (pErr) throw pErr;
        usePartyId = (data as { id: string }).id;
      }

      const header = {
        invoice_date: invoiceDate,
        due_date: dueDate || null,
        custom_invoice_no: manualNumber ? `${invoicePrefix}/${fy}/${customNo.trim()}` : null,
        party_name: customer.name.trim(),
        party_address: customer.address.trim() || null,
        party_gstin: customer.gstin.trim() || null,
        party_phone: customer.phone.trim() || null,
        party_contact: customer.contact_person.trim() || null,
        place_of_supply: customer.place_of_supply.trim() || null,
        party_state_code: customer.state_code.trim() || null,
        ship_to: customer.ship_to.trim() || null,
        invoice_type: invoiceType,
        delivery_mode: deliveryMode || null,
        reverse_charge: reverseCharge,
        tax_type: taxType,
        subtotal: totals.subtotal,
        additional_charge: totals.additionalCharge,
        total_taxable: totals.totalTaxable,
        cgst_total: totals.cgstTotal,
        sgst_total: totals.sgstTotal,
        igst_total: totals.igstTotal,
        total_tax: totals.totalTax,
        round_off: totals.roundOff,
        grand_total: totals.grandTotal,
        amount_in_words: totals.amountInWords,
        payment_type: paymentType,
        amount_paid: 0,
        terms_title: termsTitle.trim() || null,
        terms_detail: termsDetail.trim() || null,
        document_note: documentNote.trim() || null,
        status: 'saved',
      };

      const items = validLines.map((l) => {
        const a = computeLine(l, taxType);
        return {
          product_id: l.product_id, name: l.name.trim(), hsn_sac: l.hsn_sac.trim() || null, uom: l.uom.trim() || null,
          qty: Number(l.qty), unit_price: Number(l.unit_price), discount_type: l.discount_type,
          discount_value: Number(l.discount_value) || 0, gst_rate: l.gst_rate,
          taxable_amount: a.taxable, cgst_amount: a.cgst, sgst_amount: a.sgst, igst_amount: a.igst, line_total: a.lineTotal,
        };
      });

      const { data, error: rpcErr } = await supabase.rpc('save_sale_invoice', {
        p_invoice_id: initial ? initial.invoice.id : null,
        p_company_id: issuerId, p_party_id: usePartyId, p_header: header, p_items: items,
      });
      if (rpcErr) throw rpcErr;
      const saved = data as { id?: string; invoice_no?: string };
      const invoiceNo = saved?.invoice_no ?? '';

      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('activity_logs').insert({
        user_id: user?.id,
        type: isEdit ? 'Invoice Updated' : 'Invoice Created',
        description: `Admin ${isEdit ? 'updated' : 'created'} invoice ${invoiceNo} for "${customer.name.trim()}" (₹${inr(totals.grandTotal)})`,
      });

      showToast(`Invoice ${invoiceNo} ${isEdit ? 'updated' : 'created'}`);
      const dest = saved?.id ? `${LIST_PATH}/${saved.id}` : LIST_PATH;
      setTimeout(() => { router.push(dest); router.refresh(); }, 800);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message
        : err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message)
        : 'Failed to save invoice';
      setError(msg);
      showToast(msg, true);
      setIsSubmitting(false);
    }
  };

  const taxLabel = taxType === 'intra' ? 'CGST + SGST (intra-state)' : 'IGST (inter-state)';

  return (
    <main className="pt-20 lg:pt-6 px-6 lg:px-10 max-w-7xl mx-auto pb-6 lg:pb-10 min-h-screen">
      <Toast show={toast.show} message={toast.message} error={toast.error} />

      <div className="mb-6 border-b border-[#d6c3b3]/30 pb-5 lg:pb-6 flex items-center gap-4">
        <Link href={LIST_PATH} aria-label="Back to Sales Invoices"
          className="w-10 h-10 flex items-center justify-center bg-white shadow-sm border border-[#d6c3b3]/30 hover:bg-[#FAF7F2] rounded-full transition-all active:scale-95 shrink-0">
          <MdArrowBack className="text-xl text-[#2C3829]" />
        </Link>
        <div>
          <h1 className="font-jost text-2xl lg:text-3xl text-[#2C3829] mb-1 font-bold">{isEdit ? 'Edit Invoice' : 'New Invoice'}</h1>
          <p className="font-body-md lg:font-body-lg text-[#2C3829]/70">{isEdit ? `Editing ${inv?.invoice_no}` : 'Create a GST sale invoice.'}</p>
        </div>
      </div>

      {error && <div className="bg-red-500/10 text-red-600 px-4 py-3 rounded-lg mb-6 text-sm">{error}</div>}

      {/* ── Top: two-pane (details + customer | summary) ──
          relative z-20 keeps this block (and the sticky sidebar's dropdowns) above
          the product section below, which would otherwise paint over them. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-20">
        <div className="lg:col-span-8 space-y-8">
          <section className="space-y-5">
            <SectionHead>Invoice Detail</SectionHead>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {isEdit ? (
                <div>
                  <label className={LABEL_CLS}>Issued by (company)</label>
                  <div className={`${FIELD_CLS} ${bcls(false)} bg-[#F5F0E8]/50 text-[#2C3829]/70`}>{issuer.name}</div>
                </div>
              ) : (
                <Select label="Issued by (company)" value={issuerId} onChange={setIssuerId} allowNone={false}
                  options={companies.map((c) => ({ value: c.id, label: c.name + (c.is_default ? ' (default)' : '') }))} />
              )}
              <Select label="Invoice Type" value={invoiceType} onChange={setInvoiceType} allowNone={false}
                options={INVOICE_TYPES.map((t) => ({ value: t, label: t }))} />
              <DateField label="Invoice Date" value={invoiceDate} onChange={setInvoiceDate} minISO={MIN_ISO} maxISO={MAX_ISO} />
              <DateField label="Due Date" value={dueDate} onChange={setDueDate} minISO={invoiceDate || MIN_ISO} maxISO={MAX_ISO} placeholder="No due date" />
              <Select label="Delivery Mode" value={deliveryMode} onChange={setDeliveryMode} placeholder="Select delivery mode" allowNone={false}
                options={DELIVERY_MODES.map((d) => ({ value: d, label: d }))} />
              <Select label="Reverse Charge" value={reverseCharge ? 'yes' : 'no'} onChange={(v) => setReverseCharge(v === 'yes')} allowNone={false}
                options={[{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]} />
            </div>
            {isEdit ? (
              <p className="text-sm text-[#2C3829]/70">Invoice Number: <span className="font-semibold text-[#2C3829]">{inv?.invoice_no}</span> <span className="text-[#2C3829]/50">(fixed)</span></p>
            ) : (
            <label className="flex items-center gap-2 text-sm text-[#2C3829] cursor-pointer select-none">
              <input type="checkbox" checked={manualNumber} onChange={(e) => setManualNumber(e.target.checked)} className="w-4 h-4 accent-[#7A9268]" />
              Set invoice number manually
            </label>
            )}
            {!isEdit && (manualNumber ? (
              <div className="max-w-md">
                <label className={LABEL_CLS}>Invoice Number</label>
                <div className="flex items-stretch rounded-xl border border-[#d6c3b3] bg-white overflow-hidden transition-all focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/5">
                  <span className="px-3 flex items-center bg-[#F5F0E8] text-[#2C3829]/70 font-jost text-base font-medium whitespace-nowrap border-r border-[#d6c3b3] select-none">{invoicePrefix}/{fy}/</span>
                  <input value={customNo} inputMode="numeric" placeholder="0015"
                    onChange={(e) => setCustomNo(e.target.value.replace(/\D/g, ''))}
                    className="flex-1 min-w-0 px-3 py-3 font-jost text-base text-[#2C3829] outline-none bg-white" />
                </div>
                <p className="text-xs text-[#2C3829]/50 mt-1 ml-1">You type only the number — the prefix ({invoicePrefix}) and financial year ({fy}) are added automatically. Must be unique for this company.</p>
              </div>
            ) : (
              <p className="text-xs text-[#2C3829]/60">Invoice number is assigned automatically on save (per {issuer.name} · this financial year).</p>
            ))}
          </section>

          <section className="space-y-5">
            <SectionHead>Customer Information</SectionHead>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLS}>M/S (Customer Name) *</label>
                <PartyCombo value={customer.name} parties={parties}
                  onType={(v) => { setCust({ name: v }); if (partyId) setPartyId(''); }}
                  onPick={(p) => onSelectParty(p.id)} />
                {parties.length > 0 && <p className="text-xs text-[#2C3829]/50 mt-1 ml-1">Type a new name, or pick a saved customer to auto-fill.</p>}
              </div>
              <Field label="Contact Person" value={customer.contact_person} onChange={(v) => setCust({ contact_person: v })} />
              <Field label="Phone" inputMode="numeric" maxLength={10} value={customer.phone} onChange={(v) => setCust({ phone: v.replace(/\D/g, '') })} />
              <Field label="GSTIN / PAN" value={customer.gstin} onChange={(v) => setCust({ gstin: v.toUpperCase() })} maxLength={15} />
              <Field label="Place of Supply" placeholder="e.g. Kerala" value={customer.place_of_supply} onChange={(v) => setCust({ place_of_supply: v })} />
              <Field label="State Code" placeholder="e.g. 32" inputMode="numeric" maxLength={2} value={customer.state_code} onChange={(v) => setCust({ state_code: v.replace(/\D/g, '') })} />
            </div>
            <TextArea label="Address" value={customer.address} onChange={(v) => setCust({ address: v })} />
            <Field label="Ship To (if different)" value={customer.ship_to} onChange={(v) => setCust({ ship_to: v })} />
            <div className="flex items-center gap-2 text-xs flex-wrap">
              <span className={`px-2 py-0.5 rounded-full font-semibold ${taxType === 'intra' ? 'bg-[#7A9268]/15 text-[#4b6138]' : 'bg-amber-100 text-amber-700'}`}>{taxLabel}</span>
              <span className="text-[#2C3829]/50">issuer state {issuer.state_code || '—'} vs customer {customer.state_code || '—'}</span>
            </div>
            {!partyId && !isEdit && (
              <label className="flex items-center gap-2 text-sm text-[#2C3829] cursor-pointer select-none">
                <input type="checkbox" checked={saveCustomer} onChange={(e) => setSaveCustomer(e.target.checked)} className="w-4 h-4 accent-[#7A9268]" />
                Save this customer for future invoices
              </label>
            )}
          </section>
        </div>

        {/* Summary pane */}
        <div className="lg:col-span-4">
          <section className="lg:sticky lg:top-6 bg-white p-6 rounded-xl border border-[#d6c3b3]/30 shadow-sm space-y-3">
            <SectionHead>Summary</SectionHead>
            <Row label="Taxable" value={inr(totals.subtotal)} />
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-[#2C3829]/70">Additional Charge</span>
              <input inputMode="decimal" value={additionalCharge} placeholder="0.00"
                onChange={(e) => setAdditionalCharge(e.target.value.replace(/[^\d.]/g, ''))}
                className={`${CELL_CLS} ${bcls(false)} !w-28 text-right`} />
            </div>
            {taxType === 'intra' ? (
              <>
                <Row label="CGST" value={inr(totals.cgstTotal)} />
                <Row label="SGST" value={inr(totals.sgstTotal)} />
              </>
            ) : (
              <Row label="IGST" value={inr(totals.igstTotal)} />
            )}
            <Row label="Total Tax" value={inr(totals.totalTax)} />
            <label className="flex items-center justify-between gap-2 cursor-pointer select-none">
              <span className="text-sm text-[#2C3829]/70">Round Off</span>
              <span className="flex items-center gap-2">
                <span className="text-sm tabular-nums text-[#2C3829]/70">{inr(totals.roundOff)}</span>
                <input type="checkbox" checked={roundOff} onChange={(e) => setRoundOff(e.target.checked)} className="w-4 h-4 accent-[#7A9268]" />
              </span>
            </label>
            <div className="flex items-center justify-between pt-2 border-t border-[#d6c3b3]/30">
              <span className="font-jost font-semibold text-[#2C3829]">Grand Total</span>
              <span className="font-jost font-bold text-lg text-[#2C3829] tabular-nums">₹{inr(totals.grandTotal)}</span>
            </div>
            <p className="text-xs text-[#2C3829]/60 italic">{totals.amountInWords}</p>
            <div className="pt-3 border-t border-[#d6c3b3]/20">
              <Select label="Payment Type" value={paymentType} onChange={(v) => setPaymentType(v as PaymentType)} allowNone={false}
                options={PAYMENT_TYPES.map((p) => ({ value: p, label: p }))} />
            </div>
          </section>
        </div>
      </div>

      {/* ── Full-width: product items table (z-0 keeps its own dropdowns below the two-pane above) ── */}
      <section className="mt-8 space-y-4 relative z-0">
        <SectionHead>Product Items</SectionHead>
        <div className="bg-white rounded-2xl border border-[#d6c3b3]/30 shadow-[0px_2px_16px_rgba(44,56,41,0.08)]">
          <div className="overflow-x-auto lg:overflow-visible">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="bg-[#F5F0E8]/60 border-b border-[#d6c3b3]/30 text-left text-[11px] font-semibold uppercase tracking-wider text-[#2C3829]/60">
                  <th className="px-4 py-3 w-10">#</th>
                  <th className="px-3 py-3 min-w-[240px]">
                    <span className="inline-flex items-center gap-1">Product / Charge
                      <InfoTip text="Pick a product from your catalog (auto-fills HSN, price & GST), or type any custom item / charge." /></span>
                  </th>
                  <th className="px-3 py-3 w-32">
                    <span className="inline-flex items-center gap-1">HSN/SAC
                      <InfoTip text="The GST classification code — HSN for goods, SAC for services." /></span>
                  </th>
                  <th className="px-3 py-3 w-24">Qty</th>
                  <th className="px-3 py-3 w-28">
                    <span className="inline-flex items-center gap-1">UOM
                      <InfoTip text="Unit of Measure — e.g. PCS (pieces), NOS (numbers), MTR (metres), KG, GM." /></span>
                  </th>
                  <th className="px-3 py-3 w-32">Price</th>
                  <th className="px-3 py-3 w-40">
                    <span className="inline-flex items-center gap-1">Discount
                      <InfoTip text="Per-line discount. Use the ₹ / % button to switch between a flat amount and a percentage." /></span>
                  </th>
                  <th className="px-3 py-3 w-24">
                    <span className="inline-flex items-center gap-1">GST %
                      <InfoTip text="GST rate for this line. Intra-state splits into CGST + SGST; inter-state uses IGST." /></span>
                  </th>
                  <th className="px-3 py-3 w-32 text-right">Total</th>
                  <th className="px-3 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const a = computeLine(l, taxType);
                  return (
                    <tr key={l.key} className="border-b border-[#d6c3b3]/20 last:border-0">
                      <td className="px-4 py-2.5 text-[#2C3829]/50">{i + 1}</td>
                      <td className="px-3 py-2.5">
                        <ProductCombo value={l.name} products={products}
                          onType={(v) => onNameChange(l.key, v)} onPick={(p) => selectProduct(l.key, p)} />
                      </td>
                      <td className="px-3 py-2.5"><input value={l.hsn_sac} onChange={(e) => setLine(l.key, { hsn_sac: e.target.value })} className={ROW_CTRL} /></td>
                      <td className="px-3 py-2.5"><input inputMode="decimal" value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value.replace(/[^\d.]/g, '') })} className={ROW_CTRL} /></td>
                      <td className="px-3 py-2.5"><TextCombo value={l.uom} options={UOM_OPTIONS} onChange={(v) => setLine(l.key, { uom: v })} placeholder="UOM" /></td>
                      <td className="px-3 py-2.5"><input inputMode="decimal" value={l.unit_price} onChange={(e) => setLine(l.key, { unit_price: e.target.value.replace(/[^\d.]/g, '') })} className={ROW_CTRL} /></td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1">
                          <input inputMode="decimal" value={l.discount_value} onChange={(e) => setLine(l.key, { discount_value: e.target.value.replace(/[^\d.]/g, '') })} className={`${ROW_CTRL} !px-2`} />
                          <button type="button" onClick={() => setLine(l.key, { discount_type: l.discount_type === 'amount' ? 'percent' : 'amount' })}
                            className="shrink-0 w-10 h-10 rounded-lg border border-[#d6c3b3] bg-white text-xs font-semibold text-[#2C3829] hover:bg-[#f3e6dc]">
                            {l.discount_type === 'amount' ? '₹' : '%'}
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <RateSelect value={l.gst_rate} onChange={(v) => setLine(l.key, { gst_rate: v })} />
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-[#2C3829] tabular-nums">{inr(a.lineTotal)}</td>
                      <td className="px-3 py-2.5">
                        <button type="button" onClick={() => removeLine(l.key)} disabled={lines.length === 1}
                          className="w-10 h-10 rounded-full text-[#2C3829]/60 hover:text-red-600 hover:bg-red-50 flex items-center justify-center disabled:opacity-30">
                          <MdDelete className="text-base" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 border-t border-[#d6c3b3]/20">
            <button type="button" onClick={addLine} className="inline-flex items-center gap-1.5 text-sm font-medium text-[#4b6138] hover:text-[#2C3829]">
              <MdAdd className="text-lg" /> Add line
            </button>
          </div>
        </div>
      </section>

      {/* ── Full-width: terms & notes ── */}
      <section className="mt-8 space-y-4">
        <SectionHead>Terms &amp; Notes</SectionHead>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Field label="Terms Title" value={termsTitle} onChange={setTermsTitle} />
          <div />
          <TextArea label="Terms & Conditions" value={termsDetail} onChange={setTermsDetail} rows={3} />
          <TextArea label="Document Note / Remarks" value={documentNote} onChange={setDocumentNote} rows={3} />
        </div>
      </section>

      {/* ── Bottom actions ── */}
      <div className="mt-8 flex flex-col sm:flex-row items-center justify-end gap-4 border-t border-[#d6c3b3]/30 pt-6">
        <div className="mr-auto flex items-baseline gap-2">
          <span className="text-sm text-[#2C3829]/60">Grand Total</span>
          <span className="font-jost font-bold text-xl text-[#2C3829] tabular-nums">₹{inr(totals.grandTotal)}</span>
        </div>
        <Button type="button" variant="auth-social" className="!w-auto !py-3 px-8 text-sm !rounded-full" onClick={() => router.push(LIST_PATH)}>Cancel</Button>
        <Button type="button" variant="auth-primary" className="!w-auto !py-3 px-8 text-sm !rounded-full" onClick={handleSave} disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : 'Save Invoice'}
        </Button>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-[#2C3829]/70">{label}</span>
      <span className="text-sm tabular-nums text-[#2C3829]">{value}</span>
    </div>
  );
}
