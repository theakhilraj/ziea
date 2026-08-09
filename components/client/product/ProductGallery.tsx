"use client";

import React, { useState, useRef } from 'react';
import type { ProductImage } from '@/types/product';
import SmartImage from '@/components/ui/SmartImage';

interface ProductGalleryProps {
  images: ProductImage[];
}

/** Renders an image with the shared crop model (same as ProductCard). */
function CroppedImage({
  image,
  alt,
  priority,
  sizes,
  quality,
}: {
  image: ProductImage;
  alt: string;
  priority?: boolean;
  sizes: string;
  quality?: number;
}) {
  return (
    <SmartImage
      src={image.url}
      alt={alt}
      cropX={image.crop_x ?? 50}
      cropY={image.crop_y ?? 50}
      zoom={image.zoom ?? 100}
      sizes={sizes}
      priority={priority}
      quality={quality}
    />
  );
}

export default function ProductGallery({ images }: ProductGalleryProps) {
  const [activeImage, setActiveImage] = useState(0);
  const safeImages = images ?? [];
  const active = safeImages[activeImage];
  const last = safeImages.length - 1;

  const goNext = () => setActiveImage((i) => Math.min(i + 1, last));
  const goPrev = () => setActiveImage((i) => Math.max(i - 1, 0));

  // Touch swipe (mobile). A swipe suppresses the trailing tap-zone click so we
  // never navigate twice for one gesture.
  const touchStartX = useRef<number | null>(null);
  const didSwipe = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    didSwipe.current = false;
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    didSwipe.current = true;
    if (dx < 0) goNext(); // swipe left → next
    else goPrev(); // swipe right → previous
  };
  const onZoneClick = (fn: () => void) => {
    if (didSwipe.current) {
      didSwipe.current = false;
      return;
    }
    fn();
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 w-full">
      {/* Desktop Thumbnails (Hidden on Mobile) */}
      <div className="hidden md:flex flex-col gap-4 overflow-y-auto max-h-[600px] no-scrollbar shrink-0 w-20 xl:w-24">
        {safeImages.map((img, idx) => (
          <button
            key={idx}
            onClick={() => setActiveImage(idx)}
            className={`relative aspect-[4/5] w-full rounded-md overflow-hidden border-2 transition-all ${activeImage === idx ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"
              }`}
          >
            <CroppedImage image={img} alt={`Thumbnail ${idx + 1}`} sizes="96px" />
          </button>
        ))}
      </div>

      {/* Desktop Main Image — click-driven via the thumbnails. */}
      <div className="hidden md:block relative md:h-[600px] xl:h-[680px] aspect-[4/5] rounded-xl overflow-hidden bg-[#eee0d6]/30 shadow-sm">
        {active && (
          <CroppedImage image={active} alt="Product Main Image" priority quality={68} sizes="480px" />
        )}
      </div>

      {/* Mobile: single image; tap left → next, tap right → previous; swipe too. */}
      <div className="md:hidden w-full">
        <div
          className="relative w-full aspect-[4/5] rounded-xl overflow-hidden bg-[#eee0d6]/30 shadow-sm"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {active && (
            <div key={activeImage} className="absolute inset-0 animate-in fade-in duration-200">
              <CroppedImage
                image={active}
                alt={`Product image ${activeImage + 1}`}
                priority={activeImage === 0}
                quality={68}
                sizes="100vw"
              />
            </div>
          )}

          {/* Left half → next image (hidden on the last image) */}
          {activeImage < last && (
            <button
              type="button"
              aria-label="Next image"
              onClick={() => onZoneClick(goNext)}
              className="absolute inset-y-0 left-0 w-1/2 z-10"
            />
          )}

          {/* Right half → previous image (hidden on the first image) */}
          {activeImage > 0 && (
            <button
              type="button"
              aria-label="Previous image"
              onClick={() => onZoneClick(goPrev)}
              className="absolute inset-y-0 right-0 w-1/2 z-10"
            />
          )}
        </div>

        {/* Thumbnail strip — tap to jump; stays in sync with taps/swipes */}
        {safeImages.length > 1 && (
          <div className="flex gap-3 overflow-x-auto no-scrollbar w-full pt-3">
            {safeImages.map((img, idx) => (
              <button
                key={idx}
                onClick={() => setActiveImage(idx)}
                className={`relative aspect-[4/5] w-16 sm:w-20 shrink-0 rounded-md overflow-hidden border-2 transition-all ${activeImage === idx ? "border-primary" : "border-transparent opacity-70"
                  }`}
              >
                <CroppedImage image={img} alt={`Thumbnail ${idx + 1}`} sizes="80px" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
