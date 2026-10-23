"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MdArrowBack, MdEdit, MdDelete, MdOutlineBusiness, MdStarBorder } from 'react-icons/md';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import Toast from '@/components/ui/Toast';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { createClient } from '@/utils/supabase/client';
import type { IssuerCompany } from '@/utils/billing';

const NEW_PATH = '/admin/sales-invoices/settings/new';

export default function ClientInformationClient({ initialCompanies }: { initialCompanies: IssuerCompany[] }) {
  const router = useRouter();
  const supabase = createClient();

  const [companies, setCompanies] = useState<IssuerCompany[]>(initialCompanies);
  const [deleteTarget, setDeleteTarget] = useState<IssuerCompany | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toast, setToast] = useState({ message: '', show: false, error: false });

  const showToast = (message: string, isError = false) => {
    setToast({ message, show: true, error: isError });
    setTimeout(() => setToast({ message: '', show: false, error: false }), 4000);
  };

  const makeDefault = async (c: IssuerCompany) => {
    try {
      const { error: rpcErr } = await supabase.rpc('set_default_issuer_company', { p_id: c.id });
      if (rpcErr) throw rpcErr;
      setCompanies((prev) => prev.map((x) => ({ ...x, is_default: x.id === c.id })));
      showToast(`"${c.name}" is now the default`);
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to set default', true);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const { error: delErr } = await supabase.from('issuer_companies').delete().eq('id', deleteTarget.id);
      if (delErr) {
        // FK RESTRICT: a company that already has invoices can't be deleted.
        if (delErr.code === '23503') throw new Error('This company has invoices and can’t be deleted.');
        throw delErr;
      }
      setCompanies((prev) => prev.filter((c) => c.id !== deleteTarget.id));
      setDeleteTarget(null);
      showToast('Company deleted');
      router.refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete', true);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Toast show={toast.show} message={toast.message} error={toast.error} />

      {/* Header */}
      <div className="mb-6 border-b border-[#d6c3b3]/30 pb-5 lg:pb-6 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 lg:gap-0">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/sales-invoices"
            aria-label="Back to Sales Invoices"
            className="w-10 h-10 rounded-full bg-white border border-[#d6c3b3]/40 shadow-sm flex items-center justify-center text-[#2C3829] hover:bg-[#FAF7F2] active:scale-95 transition-all shrink-0"
          >
            <MdArrowBack className="text-xl" />
          </Link>
          <div>
            <h1 className="font-jost text-2xl lg:text-3xl text-[#2C3829] mb-1 font-bold">Client Information</h1>
            <p className="font-body-md lg:font-body-lg text-[#2C3829]/70">
              Company profiles that issue invoices — logo, GSTIN, bank &amp; terms. Set one as default.
            </p>
          </div>
        </div>
        {/* Top-right action only once at least one profile exists. */}
        {companies.length > 0 && (
          <Button onClick={() => router.push(NEW_PATH)} variant="auth-primary" className="!w-auto !py-3 px-6 !text-sm whitespace-nowrap shrink-0">
            Add Company
          </Button>
        )}
      </div>

      {/* List / empty state */}
      {companies.length === 0 ? (
        <Card className="border border-[#d6c3b3]/30">
          <div className="flex flex-col items-center justify-center text-center py-16 px-6">
            <div className="w-16 h-16 rounded-full bg-[#F5F0E8] flex items-center justify-center mb-4">
              <MdOutlineBusiness className="text-3xl text-[#7A9268]" />
            </div>
            <h3 className="font-jost text-lg font-semibold text-[#2C3829] mb-1">No company profiles yet</h3>
            <p className="font-body-md text-[#2C3829]/60 mb-6 max-w-sm">
              Add a company (e.g. Ziea Clothing) with its logo, GSTIN, bank details and terms. These fill the top of every invoice.
            </p>
            <Button onClick={() => router.push(NEW_PATH)} variant="auth-primary" className="!w-auto !py-3 px-6 !text-sm">
              Add Company
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {companies.map((c) => (
            <Card key={c.id} className="border border-[#d6c3b3]/30 p-5 flex flex-col">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-14 h-14 shrink-0 rounded-xl bg-[#FAF7F2] border border-[#d6c3b3]/30 overflow-hidden flex items-center justify-center">
                  {c.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.logo_url} alt={c.name} className="w-full h-full object-contain" />
                  ) : (
                    <MdOutlineBusiness className="text-2xl text-[#7A9268]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-jost font-semibold text-[#2C3829] truncate">{c.name}</h3>
                    {c.is_default && (
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide bg-[#7A9268]/15 text-[#4b6138] px-2 py-0.5 rounded-full">
                        Default
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#2C3829]/60 mt-0.5 truncate">
                    {c.gstin ? `GSTIN ${c.gstin}` : 'No GSTIN'}
                  </p>
                </div>
              </div>

              <div className="mt-auto flex items-center gap-2 pt-3 border-t border-[#d6c3b3]/20">
                {!c.is_default && (
                  <button
                    onClick={() => makeDefault(c)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-[#2C3829]/70 hover:text-[#4b6138] transition-colors mr-auto"
                  >
                    <MdStarBorder className="text-base" /> Set default
                  </button>
                )}
                <div className={`flex gap-2 ${c.is_default ? 'ml-auto' : ''}`}>
                  <Link
                    href={`/admin/sales-invoices/settings/${c.id}`}
                    className="w-8 h-8 rounded-full bg-[#2C3829] text-white flex items-center justify-center hover:opacity-90 transition-opacity"
                    aria-label="Edit"
                  >
                    <MdEdit className="text-sm" />
                  </Link>
                  <button
                    onClick={() => setDeleteTarget(c)}
                    className="w-8 h-8 rounded-full bg-[#2C3829] text-white flex items-center justify-center hover:opacity-90 transition-opacity"
                    aria-label="Delete"
                  >
                    <MdDelete className="text-sm" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <ConfirmationModal
        isOpen={!!deleteTarget}
        title="Delete Company"
        message={`Delete "${deleteTarget?.name}"? This can't be undone. A company with existing invoices can't be deleted.`}
        confirmLabel="Delete"
        icon={<MdDelete />}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        isLoading={isDeleting}
      />
    </>
  );
}
