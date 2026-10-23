"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MdArrowBack, MdBlock, MdClose, MdAddCircleOutline } from 'react-icons/md';
import { Button, buttonBase, buttonVariants } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Calendar } from '@/components/ui/Calendar';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import Toast from '@/components/ui/Toast';
import { createClient } from '@/utils/supabase/client';
import InvoiceDocument from './InvoiceDocument';
import { RECEIPT_TYPES, type SaleInvoice, type SaleInvoiceItem, type PaymentReceipt, type IssuerCompany } from '@/utils/billing';

const LIST_PATH = '/admin/sales-invoices';
const COPY_TYPES = ['ORIGINAL FOR RECIPIENT', 'DUPLICATE FOR TRANSPORTER', 'TRIPLICATE FOR SUPPLIER', 'OFFICE COPY'];
const inr = (v: number) => Number(v ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (iso?: string | null) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}-${MONTHS[Number(m) - 1] ?? m}-${y}`; };
const todayISO = () => new Date().toISOString().slice(0, 10);
const INPUT = 'w-full px-4 py-3 bg-white rounded-xl border border-[#d6c3b3] font-jost text-base text-[#2C3829] outline-none focus:border-primary focus:ring-4 focus:ring-primary/5';
const LABEL = 'font-jost text-sm font-medium text-[#2C3829] mb-1 block';

export default function InvoiceView({ invoice, items, payments, issuer }: {
  invoice: SaleInvoice;
  items: SaleInvoiceItem[];
  payments: PaymentReceipt[];
  issuer: Partial<IssuerCompany>;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [copyLabel, setCopyLabel] = useState(COPY_TYPES[0]);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState({ message: '', show: false, error: false });
  const showToast = (message: string, error = false) => {
    setToast({ message, show: true, error });
    setTimeout(() => setToast({ message: '', show: false, error: false }), 4000);
  };

  const cancelled = invoice.status === 'cancelled';
  const year = new Date().getFullYear();

  // Payment sheet
  const [showPay, setShowPay] = useState(false);
  const [payDate, setPayDate] = useState(todayISO());
  const [payType, setPayType] = useState(RECEIPT_TYPES[0]);
  const [payAmount, setPayAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [payAttach, setPayAttach] = useState('');
  const [uploading, setUploading] = useState(false);

  const openPay = () => {
    setPayDate(todayISO());
    setPayType(RECEIPT_TYPES[0]);
    setPayAmount(invoice.outstanding > 0 ? String(invoice.outstanding) : '');
    setPayNote('');
    setPayAttach('');
    setShowPay(true);
  };

  const uploadAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'billing/payments');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setPayAttach(data.url);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload failed', true);
    } finally {
      setUploading(false);
    }
  };

  const addPayment = async () => {
    if (!payAmount || Number(payAmount) <= 0) { showToast('Enter a valid amount.', true); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from('payment_receipts').insert({
        invoice_id: invoice.id, payment_date: payDate, payment_type: payType,
        amount: Number(payAmount), note: payNote.trim() || null, attachment_url: payAttach || null,
      });
      if (error) throw error;
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('activity_logs').insert({
        user_id: user?.id, type: 'Payment Received',
        description: `Admin recorded ₹${inr(Number(payAmount))} (${payType}) on invoice ${invoice.invoice_no}`,
      });
      setShowPay(false);
      showToast('Payment recorded');
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to record payment', true);
    } finally {
      setBusy(false);
    }
  };

  const doCancel = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.from('sale_invoices')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', invoice.id);
      if (error) throw error;
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('activity_logs').insert({
        user_id: user?.id, type: 'Invoice Cancelled', description: `Admin cancelled invoice ${invoice.invoice_no}`,
      });
      setConfirmCancel(false);
      showToast('Invoice cancelled');
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to cancel', true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="pt-20 lg:pt-6 px-6 lg:px-10 max-w-7xl mx-auto pb-10 min-h-screen">
      <Toast show={toast.show} message={toast.message} error={toast.error} />

      {/* Action bar (hidden when printing) */}
      <div className="print:hidden flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 border-b border-[#d6c3b3]/30 pb-5 lg:pb-6">
        <div className="flex items-center gap-4 min-w-0">
          <Link href={LIST_PATH} aria-label="Back to Sales Invoices"
            className="w-10 h-10 flex items-center justify-center bg-white shadow-sm border border-[#d6c3b3]/30 hover:bg-[#FAF7F2] rounded-full transition-all active:scale-95 shrink-0">
            <MdArrowBack className="text-xl text-[#2C3829]" />
          </Link>
          <div className="min-w-0">
            <h1 className="font-jost text-lg lg:text-xl font-semibold text-[#2C3829] flex items-center gap-2 whitespace-nowrap">
              {invoice.invoice_no}
              {cancelled && <span className="text-[11px] font-semibold uppercase bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Cancelled</span>}
            </h1>
            <p className="text-[13px] text-[#2C3829]/60 truncate">{invoice.party_name} · ₹{inr(invoice.grand_total)}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-64">
            <Select label="" value={copyLabel} onChange={setCopyLabel} allowNone={false}
              triggerClassName="!text-[13px] whitespace-nowrap" optionClassName="!text-[13px]"
              options={COPY_TYPES.map((c) => ({ value: c, label: c }))} />
          </div>

          <Button variant="auth-primary" className="!w-auto !py-3 !px-6 !text-sm !font-medium whitespace-nowrap" onClick={() => window.print()}>
            Print
          </Button>
          {!cancelled && (
            <Button variant="auth-social" className="!w-auto !py-3 !px-5 !text-sm !font-medium whitespace-nowrap" onClick={openPay}>
              Add Payment
            </Button>
          )}
          {!cancelled && (
            <Link href={`${LIST_PATH}/${invoice.id}/edit`} className={`${buttonBase} ${buttonVariants['auth-social']} !w-auto !py-3 !px-5 !text-sm !font-medium whitespace-nowrap`}>
              Edit
            </Link>
          )}
          {!cancelled && (
            <Button variant="auth-social" className="!w-auto !py-3 !px-5 !text-sm !font-medium whitespace-nowrap !text-red-600 !border-red-300 hover:!bg-red-50" onClick={() => setConfirmCancel(true)}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      <InvoiceDocument invoice={invoice} items={items} issuer={issuer} copyLabel={copyLabel} />

      {/* Payments (screen only) */}
      <div className="print:hidden mt-8 bg-white rounded-2xl border border-[#d6c3b3]/30 shadow-sm p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-jost text-lg font-semibold text-[#2C3829]">Payments</h2>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-[#2C3829]/60">Paid <span className="font-semibold text-[#2C3829]">₹{inr(invoice.amount_paid)}</span></span>
            <span className="text-[#2C3829]/60">Outstanding <span className={`font-semibold ${invoice.outstanding > 0 ? 'text-amber-600' : 'text-[#4b6138]'}`}>₹{inr(invoice.outstanding)}</span></span>
          </div>
        </div>
        {payments.length === 0 ? (
          <p className="text-sm text-[#2C3829]/50">No payments recorded yet.</p>
        ) : (
          <div className="divide-y divide-[#d6c3b3]/20">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-[#2C3829]">₹{inr(p.amount)}</span>
                  <span className="text-[11px] font-semibold uppercase bg-[#7A9268]/15 text-[#4b6138] px-2 py-0.5 rounded-full">{p.payment_type}</span>
                  <span className="text-[#2C3829]/60">{fmt(p.payment_date)}</span>
                  {p.note ? <span className="text-[#2C3829]/50 italic">· {p.note}</span> : null}
                </div>
                {p.attachment_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <a href={p.attachment_url} target="_blank" rel="noreferrer" className="text-xs text-[#4b6138] hover:underline">Attachment</a>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add-payment side sheet */}
      {showPay && (
        <div className="fixed inset-0 z-[70] flex justify-end print:hidden">
          <div className="absolute inset-0 bg-[#2C3829]/20 backdrop-blur-sm" onClick={() => setShowPay(false)} />
          <div className="relative w-full md:w-[460px] bg-[#FAF7F2] h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-6 border-b border-[#d6c3b3]/30 shrink-0">
              <h2 className="font-jost text-2xl text-[#2C3829] font-bold">Add Payment</h2>
              <button onClick={() => setShowPay(false)} className="text-[#2C3829]/70 hover:text-[#2C3829] p-2 rounded-full hover:bg-black/5"><MdClose className="text-xl" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="flex items-center justify-between bg-white rounded-xl border border-[#d6c3b3]/40 px-4 py-3 text-sm">
                <span className="text-[#2C3829]/60">Remaining</span>
                <span className="font-semibold text-[#2C3829]">₹{inr(invoice.outstanding)}</span>
              </div>
              <div>
                <label className={LABEL}>Payment Date</label>
                <Calendar value={payDate} onChange={setPayDate} minISO={`${year - 5}-01-01`} maxISO={`${year + 1}-12-31`} todayISO={todayISO()} />
              </div>
              <Select label="Payment Type" value={payType} onChange={setPayType} allowNone={false}
                options={RECEIPT_TYPES.map((t) => ({ value: t, label: t }))} />
              <div>
                <label className={LABEL}>Amount</label>
                <input inputMode="decimal" value={payAmount} onChange={(e) => setPayAmount(e.target.value.replace(/[^\d.]/g, ''))} className={INPUT} />
              </div>
              <div>
                <label className={LABEL}>Payment Note</label>
                <input value={payNote} onChange={(e) => setPayNote(e.target.value)} className={INPUT} placeholder="Optional" />
              </div>
              <div>
                <label className={LABEL}>Attachment</label>
                <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#d6c3b3] bg-white hover:bg-[#f3e6dc] text-sm text-[#2C3829]">
                  <MdAddCircleOutline className="text-lg" />
                  {uploading ? 'Uploading…' : payAttach ? 'Replace file' : 'Upload file'}
                  <input type="file" className="hidden" onChange={uploadAttach} disabled={uploading} />
                </label>
                {payAttach ? <p className="text-xs text-[#4b6138] mt-1">Attached ✓</p> : null}
              </div>
            </div>
            <div className="p-6 border-t border-[#d6c3b3]/30 flex justify-end gap-3 shrink-0">
              <Button type="button" variant="auth-social" className="!w-auto !py-3 px-8 text-sm !rounded-full" onClick={() => setShowPay(false)}>Cancel</Button>
              <Button type="button" variant="auth-primary" className="!w-auto !py-3 px-8 text-sm !rounded-full" onClick={addPayment} disabled={busy || uploading}>
                {busy ? 'Saving…' : 'Record Payment'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmCancel}
        title="Cancel Invoice"
        message={`Cancel invoice ${invoice.invoice_no}? It stays in your records (number preserved) but is marked cancelled.`}
        confirmLabel="Cancel Invoice"
        icon={<MdBlock />}
        onConfirm={doCancel}
        onCancel={() => setConfirmCancel(false)}
        isLoading={busy}
      />
    </main>
  );
}
