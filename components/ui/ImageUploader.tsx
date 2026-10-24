"use client";

import React, { useRef, useState } from "react";
import { MdUploadFile, MdDelete, MdImage } from "react-icons/md";
import type { BrandImage } from "@/utils/branding";
import SmartImage from "@/components/ui/SmartImage";

interface ImageUploaderProps {
  value: BrandImage | null;
  onChange: (value: BrandImage | null) => void;
  /** Upload folder under cdn/, e.g. "branding/about". */
  folder: string;
  /** CSS aspect ratio for the preview frame, e.g. "16/9". */
  aspect?: string;
  label?: string;
  hint?: string;
}

/**
 * Self-contained image control: upload (→ /api/upload) or paste a URL, then
 * crop with pan/zoom sliders over a live SmartImage preview. Emits a BrandImage
 * ({ url, cropX, cropY, zoom }) — the same model products/categories/branding
 * all share.
 */
export default function ImageUploader({
  value,
  onChange,
  folder,
  aspect = "4/5",
  label,
  hint,
}: ImageUploaderProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [urlInput, setUrlInput] = useState("");

  const set = (patch: Partial<BrandImage>) => {
    if (!value) return;
    onChange({ ...value, ...patch });
  };

  const handleFile = async (file: File) => {
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", folder);
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || "Upload failed");
      onChange({ url: data.url, cropX: 50, cropY: 50, zoom: 100 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      {label && (
        <p className="font-jost text-sm font-medium text-[#2C3829]">{label}</p>
      )}

      {/* Preview frame */}
      <div
        className="relative w-full overflow-hidden rounded-xl border border-[#d6c3b3]/40 bg-[#FAF7F2]"
        style={{ aspectRatio: aspect.replace("/", " / ") }}
      >
        {value?.url ? (
          <SmartImage
            src={value.url}
            alt={label || "Preview"}
            cropX={value.cropX}
            cropY={value.cropY}
            zoom={value.zoom}
            sizes="400px"
          />
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-[#2C3829]/50 hover:text-[#2C3829]/80 hover:bg-[#f3e6dc]/40 transition-colors"
          >
            <MdImage className="text-4xl" />
            <span className="text-xs font-jost">Click to upload</span>
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />

      {/* Controls */}
      {value?.url ? (
        <div className="space-y-3 rounded-xl border border-[#d6c3b3]/30 bg-white p-3">
          <Slider label="Zoom" min={50} max={300} step={5} value={value.zoom} suffix="%" onChange={(v) => set({ zoom: v })} />
          <Slider label="Horizontal" min={0} max={100} step={1} value={value.cropX} suffix="%" onChange={(v) => set({ cropX: v })} />
          <Slider label="Vertical" min={0} max={100} step={1} value={value.cropY} suffix="%" onChange={(v) => set({ cropY: v })} />
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-[#2C3829] px-3 py-2 text-xs font-jost font-medium text-white hover:opacity-90 disabled:opacity-50 transition"
            >
              <MdUploadFile className="text-base" /> {uploading ? "Uploading…" : "Replace"}
            </button>
            <button
              type="button"
              onClick={() => onChange(null)}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-jost font-medium text-red-600 hover:bg-red-100 transition"
            >
              <MdDelete className="text-base" /> Remove
            </button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="…or paste an image URL"
            className="flex-1 rounded-lg border border-[#d6c3b3]/50 bg-white px-3 py-2 text-xs text-[#2C3829] outline-none focus:border-[#2C3829]/40"
          />
          <button
            type="button"
            disabled={!urlInput.trim()}
            onClick={() => {
              onChange({ url: urlInput.trim(), cropX: 50, cropY: 50, zoom: 100 });
              setUrlInput("");
            }}
            className="rounded-lg bg-[#2C3829] px-3 py-2 text-xs font-jost font-medium text-white disabled:opacity-40"
          >
            Add
          </button>
        </div>
      )}

      {hint && <p className="text-[11px] text-[#2C3829]/50 font-jost">{hint}</p>}
      {error && <p className="text-[11px] text-red-600 font-jost">{error}</p>}
    </div>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  suffix = "",
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-[11px] text-[#2C3829]/70 font-jost mb-1">
        <span>{label}</span>
        <span>{Math.round(value)}{suffix}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[#2C3829]"
      />
    </div>
  );
}
