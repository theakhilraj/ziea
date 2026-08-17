"use client";

import React, { useState } from 'react';
import { MdArrowBack, MdAdd, MdDelete, MdDesktopMac, MdSmartphone, MdArrowUpward, MdArrowDownward } from 'react-icons/md';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { revalidateStorefront } from '@/app/actions/revalidate';
import Toast from '@/components/ui/Toast';
import ImageUploader from '@/components/ui/ImageUploader';
import {
  BRANDING_SCHEMA,
  aspectResolution,
  toBrandImage,
  toBrandImageList,
  toHeroSlide,
  type BrandImage,
  type HeroSlide,
} from '@/utils/branding';

const EMPTY: BrandImage = { url: '', cropX: 50, cropY: 50, zoom: 100 };

export default function BrandingEditClient({ section }: { section: any }) {
  const router = useRouter();
  const supabase = createClient();
  const schema = BRANDING_SCHEMA[section.section_name];

  // Home: hero slides
  const [slides, setSlides] = useState<HeroSlide[]>(() => {
    const raw = section.images?.heroSlides;
    return Array.isArray(raw) ? raw.map(toHeroSlide) : [];
  });

  // About / Auth: named slots
  const [slots, setSlots] = useState<Record<string, BrandImage | BrandImage[] | null>>(() => {
    if (!schema || schema.kind !== 'slots') return {};
    const out: Record<string, BrandImage | BrandImage[] | null> = {};
    for (const s of schema.slots) {
      out[s.key] = s.kind === 'list'
        ? toBrandImageList(section.images?.[s.key])
        : toBrandImage(section.images?.[s.key]);
    }
    return out;
  });

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ message: '', show: false, error: false });
  const showToast = (message: string, error = false) => {
    setToast({ message, show: true, error });
    setTimeout(() => setToast({ message: '', show: false, error: false }), 4000);
  };

  // ── Slide helpers ──
  const addSlide = () =>
    setSlides((p) => [...p, { id: `slide-${Date.now()}`, desktop: null, mobile: null, headline: '', subHeadline: '' }]);
  const removeSlide = (id: string) => setSlides((p) => p.filter((s) => s.id !== id));
  const updateSlide = (id: string, patch: Partial<HeroSlide>) =>
    setSlides((p) => p.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const moveSlide = (i: number, dir: -1 | 1) =>
    setSlides((p) => {
      const j = i + dir;
      if (j < 0 || j >= p.length) return p;
      const n = [...p];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  // ── Slot helpers ──
  const setSingle = (key: string, v: BrandImage | null) => setSlots((p) => ({ ...p, [key]: v }));
  const addListItem = (key: string) =>
    setSlots((p) => ({ ...p, [key]: [...((p[key] as BrandImage[]) ?? []), { ...EMPTY }] }));
  const updateListItem = (key: string, idx: number, v: BrandImage | null) =>
    setSlots((p) => {
      const list = [...((p[key] as BrandImage[]) ?? [])];
      if (v === null) list.splice(idx, 1);
      else list[idx] = v;
      return { ...p, [key]: list };
    });

  const handleSave = async () => {
    setSaving(true);
    try {
      let images: Record<string, unknown>;
      if (schema?.kind === 'home') {
        images = { heroSlides: slides };
      } else if (schema?.kind === 'slots') {
        images = {};
        for (const s of schema.slots) {
          const v = slots[s.key];
          images[s.key] =
            s.kind === 'list'
              ? ((v as BrandImage[]) ?? []).filter((i) => i?.url)
              : v && (v as BrandImage).url
                ? v
                : null;
        }
      } else {
        images = section.images ?? {};
      }

      const { error } = await supabase
        .from('branding_assets')
        .update({ images, updated_at: new Date().toISOString() })
        .eq('id', section.id);
      if (error) throw error;

      await revalidateStorefront('branding');
      showToast('Saved successfully!');
      setTimeout(() => router.push('/admin/branding'), 600);
    } catch (err: any) {
      showToast(err.message || 'Failed to save', true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Toast show={toast.show} message={toast.message} error={toast.error} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-[#d6c3b3]/30 pb-6">
        <div className="flex items-center gap-4">
          <Link href="/admin/branding" className="w-10 h-10 shrink-0 bg-white rounded-full flex items-center justify-center border border-[#d6c3b3]/30 hover:bg-[#f8f5f1] transition-colors">
            <MdArrowBack className="text-[#2C3829] text-xl" />
          </Link>
          <div>
            <h1 className="font-jost text-2xl lg:text-3xl text-[#2C3829] font-bold">Edit {section.section_name}</h1>
            <p className="font-body-md text-[#2C3829]/70 mt-1">Manage the images shown in this section.</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full sm:w-auto shrink-0 flex items-center justify-center gap-2 rounded-full bg-[#2C3829] px-6 py-3 text-sm font-jost font-medium text-white hover:opacity-90 active:scale-[0.98] disabled:opacity-50 transition"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>

      {/* Body */}
      {schema?.kind === 'home' ? (
        <div className="space-y-6">
          {slides.map((slide, i) => (
            <div key={slide.id} className="rounded-2xl border border-[#d6c3b3]/30 bg-white p-5 lg:p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-jost font-semibold text-[#2C3829]">Slide {i + 1}</h3>
                <div className="flex gap-2">
                  <IconBtn onClick={() => moveSlide(i, -1)} disabled={i === 0}><MdArrowUpward /></IconBtn>
                  <IconBtn onClick={() => moveSlide(i, 1)} disabled={i === slides.length - 1}><MdArrowDownward /></IconBtn>
                  <IconBtn onClick={() => removeSlide(slide.id)} danger><MdDelete /></IconBtn>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="flex items-center gap-1.5 font-jost text-xs uppercase tracking-wide text-[#2C3829]/60 mb-2"><MdDesktopMac /> Desktop ({aspectResolution('16/9')})</p>
                  <ImageUploader value={slide.desktop} onChange={(v) => updateSlide(slide.id, { desktop: v })} folder="branding/home" aspect="16/9" />
                </div>
                <div>
                  <p className="flex items-center gap-1.5 font-jost text-xs uppercase tracking-wide text-[#2C3829]/60 mb-2"><MdSmartphone /> Mobile ({aspectResolution('4/5')})</p>
                  <ImageUploader value={slide.mobile} onChange={(v) => updateSlide(slide.id, { mobile: v })} folder="branding/home" aspect="4/5" />
                </div>
              </div>
            </div>
          ))}
          <button onClick={addSlide} className="flex items-center gap-2 rounded-xl border-2 border-dashed border-[#d6c3b3] px-5 py-3 text-sm font-jost font-medium text-[#2C3829] hover:bg-[#f8f5f1] transition w-full justify-center">
            <MdAdd className="text-lg" /> Add Slide
          </button>
        </div>
      ) : schema?.kind === 'slots' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {schema.slots.map((slot) => (
            <div key={slot.key} className="rounded-2xl border border-[#d6c3b3]/30 bg-white p-5 lg:p-6">
              <div className="mb-4">
                <h3 className="font-jost font-semibold text-[#2C3829] mb-1">{slot.label}</h3>
                <p className="font-jost text-xs uppercase tracking-wide text-[#2C3829]/60">{aspectResolution(slot.aspect)}</p>
                {slot.hint && <p className="text-xs text-[#2C3829]/50 mt-1">{slot.hint}</p>}
              </div>

              {slot.kind === 'single' ? (
                <ImageUploader
                  value={(slots[slot.key] as BrandImage) ?? null}
                  onChange={(v) => setSingle(slot.key, v)}
                  folder={slot.folder}
                  aspect={slot.aspect}
                />
              ) : (
                <div className="space-y-4">
                  {((slots[slot.key] as BrandImage[]) ?? []).map((item, idx) => (
                    <ImageUploader
                      key={idx}
                      value={item?.url ? item : null}
                      onChange={(v) => updateListItem(slot.key, idx, v)}
                      folder={slot.folder}
                      aspect={slot.aspect}
                    />
                  ))}
                  <button onClick={() => addListItem(slot.key)} className="flex items-center gap-2 rounded-xl border-2 border-dashed border-[#d6c3b3] px-4 py-2.5 text-sm font-jost font-medium text-[#2C3829] hover:bg-[#f8f5f1] transition w-full justify-center">
                    <MdAdd className="text-lg" /> Add Image
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-[#d6c3b3]/30 bg-white p-10 text-center text-[#2C3829]/60">
          This section has no editable images.
        </div>
      )}
    </>
  );
}

function IconBtn({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean; }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-8 h-8 rounded-full flex items-center justify-center border transition disabled:opacity-30 ${danger ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100' : 'border-[#d6c3b3]/40 bg-white text-[#2C3829] hover:bg-[#f8f5f1]'}`}
    >
      {children}
    </button>
  );
}
