import Image from "next/image";
import { resolveImageUrl } from "@/utils/image-url";

interface SmartImageProps {
  src: string;
  alt: string;
  /** Focal point + zoom (same model as the admin cropper). Defaults = centered, no zoom. */
  cropX?: number; // 0–100, horizontal center of the visible region
  cropY?: number; // 0–100, vertical center
  zoom?: number; // percent (100 = fit the frame)
  /** Responsive hint: the rendered width of the frame per breakpoint. */
  sizes: string;
  priority?: boolean;
  className?: string;
  /** next/image quality (1–100). Default 75; use higher for hero/large imagery. */
  quality?: number;
}

/**
 * Drop-in replacement for the raw <img> crop layer used across the storefront.
 * The CALLER provides the frame (a positioned, overflow-hidden box with a fixed
 * aspect ratio); SmartImage fills it using the same pan/zoom model as before,
 * but via next/image so the browser only downloads the size it needs (srcset)
 * and gets WebP/AVIF. Focal point (cropX/cropY/zoom) keeps the subject visible
 * when a non-4:5 frame crops the 1080×1350 master.
 */
export default function SmartImage({
  src,
  alt,
  cropX = 50,
  cropY = 50,
  zoom = 100,
  sizes,
  priority = false,
  className = "",
  quality,
}: SmartImageProps) {
  const imageSrc = resolveImageUrl(src);

  // Legacy BunnyCDN images can't be fetched by the server-side optimizer
  // (hotlink protection), so serve them straight to the browser like before.
  // New/migrated images on our own domain get fully optimized.
  const unoptimized = /(^https?:)?\/\/[^/]*b-cdn\.net\//.test(imageSrc);

  return (
    // object-cover fills the frame; object-position picks which part of the image
    // is visible (0% = top/left, 100% = bottom/right) so panning works at any zoom
    // and across mismatched aspect ratios. zoom (>100%) scales in from the center.
    <Image
      src={imageSrc}
      alt={alt}
      fill
      sizes={sizes}
      // Next 16: `priority` is deprecated. Preload the LCP image via a <head>
      // link AND hint fetchPriority=high so Lighthouse's LCP discovery passes.
      preload={priority || undefined}
      fetchPriority={priority ? "high" : undefined}
      quality={quality}
      unoptimized={unoptimized}
      className={`object-cover select-none pointer-events-none ${className}`}
      style={{
        objectPosition: `${cropX}% ${cropY}%`,
        transform: zoom !== 100 ? `scale(${zoom / 100})` : undefined,
        transformOrigin: "center",
      }}
    />
  );
}
