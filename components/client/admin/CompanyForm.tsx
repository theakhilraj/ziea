"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import { MdArrowBack, MdOutlineBusiness, MdAddCircleOutline } from 'react-icons/md';
import { Button } from '@/components/ui/Button';
import Toast from '@/components/ui/Toast';
import { createClient } from '@/utils/supabase/client';
import type { IssuerCompany } from '@/utils/billing';

const SETTINGS_PATH = '/admin/sales-invoices/settings';

const EMPTY = {
  name: '', logo_url: '', gstin: '', pan: '', state: '', state_code: '',
  address: '', phone: '', email: '', bank_name: '', bank_branch: '',
  bank_account_name: '', bank_account_number: '', bank_ifsc: '',
  invoice_prefix: '', terms_title: 'Terms and Conditions', terms_detail: '',
  signatory: '', is_default: false,
};

type FormState = typeof EMPTY;

// ── Validation (Zod) ─────────────────────────────────────────────────────────
// GSTIN = 2-digit state code + 10-char PAN + registration digit + 'Z' + checksum.
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

// Optional field: blank passes; otherwise it must match the schema.
const optional = (schema: z.ZodType<string>) =>
  z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : typeof v === 'string' ? v.trim() : v),
    schema.optional(),
  );

const companySchema = z.object({
  name: z.string().trim().min(1, 'Company name is required').max(120, 'Too long'),
  gstin: optional(z.string().length(15, 'GSTIN must be 15 characters').regex(GSTIN_RE, 'Invalid GSTIN — check the format')),
  pan: optional(z.string().regex(PAN_RE, 'Invalid PAN — format ABCDE1234F')),
  state_code: optional(z.string().regex(/^\d{2}$/, 'State code must be 2 digits')),
  phone: optional(z.string().regex(/^\d{10}$/, 'Phone must be exactly 10 digits')),
  email: optional(z.string().email('Enter a valid email address')),
  bank_ifsc: optional(z.string().regex(IFSC_RE, 'Invalid IFSC — format SIBL0000844')),
  bank_account_number: optional(z.string().regex(/^\d{9,18}$/, 'Account number must be 9–18 digits')),
});

// ── Styled controls (match the product-edit form) ────────────────────────────
const INPUT_CLS =
  'w-full px-4 py-3 bg-white rounded-xl font-jost font-normal text-base text-[#2C3829] transition-all outline-none focus:ring-4 focus:ring-primary/5 duration-200';
const LABEL_CLS = 'font-jost text-sm font-medium text-[#2C3829] mb-1 block';
const borderCls = (hasError?: boolean) =>
  hasError ? 'border border-red-400 focus:border-red-500' : 'border border-[#d6c3b3] focus:border-primary hover:border-primary/50';

function Field({ label, value, onChange, placeholder, type = 'text', required, error, maxLength, inputMode }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  type?: string; required?: boolean; error?: string; maxLength?: number;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  return (
    <div>
      <label className={LABEL_CLS}>{label}</label>
      <input type={type} value={value} placeholder={placeholder} required={required} maxLength={maxLength} inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)} className={`${INPUT_CLS} ${borderCls(!!error)}`} />
      {error && <p className="text-xs text-red-600 mt-1 ml-1">{error}</p>}
    </div>
  );
}

function TextArea({ label, value, onChange, rows = 3, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string;
}) {
  return (
    <div>
      <label className={LABEL_CLS}>{label}</label>
      <textarea value={value} rows={rows} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)} className={`${INPUT_CLS} ${borderCls(false)} resize-y`} />
    </div>
  );
}

const SectionHead = ({ children }: { children: React.ReactNode }) => (
  <h3 className="font-jost text-lg font-semibold text-[#2C3829] border-b border-[#d6c3b3]/30 pb-3">{children}</h3>
);

// Read an image file's intrinsic pixel size (for aspect-correct logo placement on
// the PDF). SVGs without an intrinsic size resolve to 0 → stored as null.
function readImageSize(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => { resolve({ w: img.naturalWidth, h: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve({ w: 0, h: 0 }); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

export default function CompanyForm({ initial = null, companiesCount }: {
  initial?: IssuerCompany | null;
  companiesCount: number;
}) {
  const router = useRouter();
  const supabase = createClient();
  const isEdit = !!initial;
  const isFirst = !isEdit && companiesCount === 0;

  const [form, setForm] = useState<FormState>(
    initial
      ? {
          name: initial.name ?? '', logo_url: initial.logo_url ?? '', gstin: initial.gstin ?? '',
          pan: initial.pan ?? '', state: initial.state ?? '', state_code: initial.state_code ?? '',
          address: initial.address ?? '', phone: initial.phone ?? '', email: initial.email ?? '',
          bank_name: initial.bank_name ?? '', bank_branch: initial.bank_branch ?? '',
          bank_account_name: initial.bank_account_name ?? '', bank_account_number: initial.bank_account_number ?? '',
          bank_ifsc: initial.bank_ifsc ?? '', invoice_prefix: initial.invoice_prefix ?? '',
          terms_title: initial.terms_title ?? 'Terms and Conditions', terms_detail: initial.terms_detail ?? '',
          signatory: initial.signatory ?? '', is_default: initial.is_default,
        }
      : { ...EMPTY, is_default: isFirst },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoW, setLogoW] = useState<number | null>(initial?.logo_width ?? null);
  const [logoH, setLogoH] = useState<number | null>(initial?.logo_height ?? null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', show: false, error: false });

  // Clear a field's error as the user edits it.
  const set = (patch: Partial<FormState>) => {
    setForm((p) => ({ ...p, ...patch }));
    const keys = Object.keys(patch);
    setErrors((prev) => {
      if (!keys.some((k) => prev[k])) return prev;
      const next = { ...prev };
      keys.forEach((k) => delete next[k]);
      return next;
    });
  };

  const showToast = (message: string, isError = false) => {
    setToast({ message, show: true, error: isError });
    setTimeout(() => setToast({ message: '', show: false, error: false }), 4000);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'billing/logos');
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to upload logo');
      set({ logo_url: data.url });
      const { w, h } = await readImageSize(file);
      setLogoW(w || null);
      setLogoH(h || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error uploading logo');
    } finally {
      setUploading(false);
    }
  };

  // Trim + null-out empties so the DB stores NULL, not ''.
  const payload = () => {
    const clean: Record<string, string | null> = {};
    (Object.keys(EMPTY) as (keyof FormState)[]).forEach((k) => {
      if (k === 'is_default') return;
      const v = String(form[k] ?? '').trim();
      clean[k] = v === '' ? null : v;
    });
    return clean;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsed = companySchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const flat: Record<string, string> = {};
      Object.entries(fieldErrors).forEach(([k, v]) => { if (v && v[0]) flat[k] = v[0]; });
      setErrors(flat);
      showToast('Please fix the highlighted fields before saving.', true);
      return;
    }
    setErrors({});
    setIsSubmitting(true);
    setError('');
    try {
      const wantsDefault = form.is_default || isFirst;
      let id: string;

      if (initial) {
        const { error: upErr } = await supabase
          .from('issuer_companies')
          .update({ ...payload(), logo_width: logoW, logo_height: logoH, updated_at: new Date().toISOString() })
          .eq('id', initial.id);
        if (upErr) throw upErr;
        id = initial.id;
      } else {
        const { data, error: insErr } = await supabase
          .from('issuer_companies')
          .insert({ ...payload(), logo_width: logoW, logo_height: logoH, is_default: false })
          .select('id')
          .single();
        if (insErr) throw insErr;
        id = (data as { id: string }).id;
      }

      // Default goes through the RPC so only one row is ever default.
      if (wantsDefault && !initial?.is_default) {
        const { error: rpcErr } = await supabase.rpc('set_default_issuer_company', { p_id: id });
        if (rpcErr) throw rpcErr;
      } else if (!form.is_default && initial?.is_default) {
        await supabase.from('issuer_companies').update({ is_default: false }).eq('id', id);
      }

      // Log to Activity. user_id = the acting admin, so it's self-suppressed from
      // the notification bell (they don't get pinged for their own action) but
      // still shows in the Activity feed. Non-blocking — a log failure won't fail the save.
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('activity_logs').insert({
        user_id: user?.id,
        type: isEdit ? 'Company Updated' : 'Company Added',
        description: `Admin ${isEdit ? 'updated' : 'added'} billing company "${form.name.trim()}"`,
      });

      showToast(isEdit ? 'Company updated' : 'Company saved');
      // Brief pause so the success toast is visible before we leave the page.
      setTimeout(() => {
        router.push(SETTINGS_PATH);
        router.refresh();
      }, 800);
    } catch (err) {
      // Supabase/PostgREST errors are plain objects (not Error) — read .message.
      const msg =
        err instanceof Error
          ? err.message
          : err && typeof err === 'object' && 'message' in err && (err as { message?: unknown }).message
            ? String((err as { message: unknown }).message)
            : 'Failed to save company';
      setError(msg);
      showToast(msg, true);
      setIsSubmitting(false);
    }
  };

  return (
    <main className="pt-20 lg:pt-6 px-6 lg:px-10 max-w-7xl mx-auto pb-6 lg:pb-10 min-h-screen">
      <Toast show={toast.show} message={toast.message} error={toast.error} />

      {/* Header */}
      <div className="mb-6 border-b border-[#d6c3b3]/30 pb-5 lg:pb-6 flex items-center gap-4">
        <Link
          href={SETTINGS_PATH}
          aria-label="Back to Client Information"
          className="w-10 h-10 flex items-center justify-center bg-white shadow-sm border border-[#d6c3b3]/30 hover:bg-[#FAF7F2] rounded-full transition-all active:scale-95 shrink-0"
        >
          <MdArrowBack className="text-xl text-[#2C3829]" />
        </Link>
        <div>
          <h1 className="font-jost text-2xl lg:text-3xl text-[#2C3829] mb-1 font-bold">
            {isEdit ? 'Edit Company' : 'Add Company'}
          </h1>
          <p className="font-body-md lg:font-body-lg text-[#2C3829]/70">
            These details fill the top of every invoice this company issues.
          </p>
        </div>
      </div>

      {error && <div className="bg-red-500/10 text-red-600 px-4 py-3 rounded-lg mb-6 text-sm">{error}</div>}

      <form id="companyForm" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: details (this column scrolls) */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-8">
            <section className="space-y-6">
              <SectionHead>Company Details</SectionHead>
              <div className="space-y-4">
                <Field label="Company Name *" placeholder="e.g. Ziea Clothing" value={form.name} onChange={(v) => set({ name: v })} required error={errors.name} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="GSTIN" placeholder="e.g. 32ABCDE1234F1Z5" value={form.gstin} onChange={(v) => set({ gstin: v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() })} error={errors.gstin} maxLength={15} />
                  <Field label="PAN" placeholder="e.g. ABCDE1234F" value={form.pan} onChange={(v) => set({ pan: v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() })} error={errors.pan} maxLength={10} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="State" placeholder="e.g. Kerala" value={form.state} onChange={(v) => set({ state: v })} error={errors.state} />
                  <Field label="State Code" placeholder="e.g. 32" inputMode="numeric" value={form.state_code} onChange={(v) => set({ state_code: v.replace(/\D/g, '') })} error={errors.state_code} maxLength={2} />
                </div>
                <TextArea label="Address" value={form.address} onChange={(v) => set({ address: v })} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Phone" type="tel" inputMode="numeric" placeholder="10-digit number" value={form.phone} onChange={(v) => set({ phone: v.replace(/\D/g, '') })} error={errors.phone} maxLength={10} />
                  <Field label="Email" type="email" value={form.email} onChange={(v) => set({ email: v })} error={errors.email} />
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <SectionHead>Bank Details</SectionHead>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Bank Name" value={form.bank_name} onChange={(v) => set({ bank_name: v })} />
                  <Field label="Branch" value={form.bank_branch} onChange={(v) => set({ bank_branch: v })} />
                </div>
                <Field label="Account Name" placeholder="Account holder name" value={form.bank_account_name} onChange={(v) => set({ bank_account_name: v.replace(/[^a-zA-Z\s.&'-]/g, '') })} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Account Number" placeholder="9–18 digits" inputMode="numeric" value={form.bank_account_number} onChange={(v) => set({ bank_account_number: v.replace(/\D/g, '') })} error={errors.bank_account_number} maxLength={18} />
                  <Field label="IFSC" placeholder="e.g. SIBL0000844" value={form.bank_ifsc} onChange={(v) => set({ bank_ifsc: v.replace(/[^a-zA-Z0-9]/g, '').toUpperCase() })} error={errors.bank_ifsc} maxLength={11} />
                </div>
              </div>
            </section>

            <section className="space-y-6">
              <SectionHead>Invoice Defaults</SectionHead>
              <div className="space-y-4">
                <Field label="Invoice Prefix" placeholder="e.g. ZIEA" value={form.invoice_prefix} onChange={(v) => set({ invoice_prefix: v })} />
                <Field label="Terms Title" value={form.terms_title} onChange={(v) => set({ terms_title: v })} />
                <TextArea label="Terms & Conditions" value={form.terms_detail} onChange={(v) => set({ terms_detail: v })} rows={4} />
                <Field label="Authorised Signatory" placeholder="e.g. For Ziea Clothing" value={form.signatory} onChange={(v) => set({ signatory: v })} />
              </div>
            </section>
          </div>

          {/* Right: logo + actions (sticky — stays while the left column scrolls) */}
          <div className="lg:col-span-5 xl:col-span-4">
            <div className="lg:sticky lg:top-6 space-y-6">
              <section className="bg-white p-6 rounded-xl border border-[#d6c3b3]/30 shadow-sm space-y-4">
                <SectionHead>Company Logo</SectionHead>
                <div className="w-full h-32 rounded-xl bg-[#FAF7F2] border border-[#d6c3b3] overflow-hidden flex items-center justify-center">
                  {form.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={form.logo_url} alt="Logo" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <MdOutlineBusiness className="text-4xl text-[#7A9268]/60" />
                  )}
                </div>
                <label className="cursor-pointer w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#d6c3b3] bg-white hover:bg-[#f3e6dc] text-sm text-[#2C3829] transition-colors">
                  <MdAddCircleOutline className="text-lg" />
                  {uploading ? 'Uploading…' : form.logo_url ? 'Replace logo' : 'Upload logo'}
                  <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} disabled={uploading} />
                </label>
                {form.logo_url && logoW && logoH ? (
                  <p className="text-xs text-[#2C3829]/75 text-center">
                    Dimensions: <span className="font-medium">{logoW} × {logoH} px</span>
                  </p>
                ) : (
                  <p className="text-xs text-[#2C3829]/65 text-center">Recommended: transparent PNG, ~320 × 120 px</p>
                )}

                <label className="flex items-center gap-3 pt-3 mt-1 border-t border-[#d6c3b3]/20 cursor-pointer select-none">
                  <input type="checkbox" checked={form.is_default} onChange={(e) => set({ is_default: e.target.checked })}
                    className="w-5 h-5 accent-[#7A9268]" disabled={isFirst} />
                  <span className="text-sm text-[#2C3829]">
                    Set as default {isFirst && <span className="text-[#2C3829]/65">(first is default)</span>}
                  </span>
                </label>
              </section>

              <div className="flex flex-col gap-3">
                <Button type="submit" variant="auth-primary" className="!py-3.5 text-sm" disabled={isSubmitting || uploading}>
                  {isSubmitting ? 'Saving…' : isEdit ? 'Update Company' : 'Save Company'}
                </Button>
                <Button type="button" variant="auth-social" className="!py-3 text-sm" onClick={() => router.push(SETTINGS_PATH)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </main>
  );
}
