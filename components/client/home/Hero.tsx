"use client";

import { useEffect, useState } from "react";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import SmartImage from "../../ui/SmartImage";
import type { HeroSlide } from "@/utils/branding";

// Fallback images shown only until Branding → Home Page slides are uploaded.
const FALLBACK_IMAGES = [
  "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1600&q=80",
  "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1600&q=80",
  "https://images.unsplash.com/photo-1445205170230-053b83016050?w=1600&q=80",
];

export default function Hero({ slides: brandingSlides }: { slides?: HeroSlide[] }) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const fallbackSlides: HeroSlide[] = FALLBACK_IMAGES.map((url, i) => ({
    id: `fallback-${i}`,
    desktop: { url, cropX: 50, cropY: 50, zoom: 100 },
    mobile: { url, cropX: 50, cropY: 50, zoom: 100 },
    headline: "",
    subHeadline: "",
  }));
  const activeSlides =
    brandingSlides && brandingSlides.length ? brandingSlides : fallbackSlides;

  // Auto-advance the carousel — but hold still for the first few seconds so the
  // hero (the LCP element) settles before any repaint. Continuously repainting
  // during initial load is what inflates Lighthouse's Speed Index on mobile.
  useEffect(() => {
    if (activeSlides.length <= 1) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      interval = setInterval(() => {
        setCurrentImageIndex((prev) => (prev + 1) % activeSlides.length);
      }, 5000);
    }, 5000);
    return () => {
      clearTimeout(start);
      if (interval) clearInterval(interval);
    };
  }, [activeSlides.length]);

  const goPrev = () =>
    setCurrentImageIndex((p) => (p - 1 + activeSlides.length) % activeSlides.length);
  const goNext = () =>
    setCurrentImageIndex((p) => (p + 1) % activeSlides.length);

  const slideIndex = activeSlides.length ? currentImageIndex % activeSlides.length : 0;
  const currentSlide = activeSlides[slideIndex];
  const desktopImg = currentSlide?.desktop ?? currentSlide?.mobile ?? null;
  const mobileImg = currentSlide?.mobile ?? currentSlide?.desktop ?? null;

  return (
    <section
      id="hero"
      className="relative w-full aspect-[4/5] md:aspect-auto md:h-[calc(100vh-80px)] overflow-hidden"
    >
      {/* Background image carousel (desktop + mobile art direction).
          Fills the frame exactly (no parallax) so it matches the admin crop preview. */}
      <div className="absolute inset-0 transition-opacity duration-1000">
        {desktopImg && (
          <div className="hidden md:block absolute inset-0 overflow-hidden">
            <SmartImage
              src={desktopImg.url}
              alt="ZIEA"
              cropX={desktopImg.cropX}
              cropY={desktopImg.cropY}
              zoom={desktopImg.zoom}
              sizes="100vw"
              quality={68}
              priority
            />
          </div>
        )}
        {mobileImg && (
          <div className="md:hidden absolute inset-0 overflow-hidden">
            <SmartImage
              src={mobileImg.url}
              alt="ZIEA"
              cropX={mobileImg.cropX}
              cropY={mobileImg.cropY}
              zoom={mobileImg.zoom}
              sizes="100vw"
              quality={68}
              priority
            />
          </div>
        )}
        {/* Faint bottom gradient purely so the slide dots stay legible on any image */}
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/25 to-transparent pointer-events-none" />
      </div>

      {/* Tap/click zones: left half = previous, right half = next. Sit below the
          dots (z-10 < z-20) so the dots stay independently clickable. On desktop a
          subtle chevron fades in on hover; on mobile they're invisible tap targets. */}
      {activeSlides.length > 1 && (
        <>
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous slide"
            className="group absolute left-0 top-0 z-10 h-full w-1/2 flex items-center justify-start px-3 md:px-6 focus:outline-none"
          >
            <MdChevronLeft className="text-white/0 md:group-hover:text-white/80 text-4xl drop-shadow transition-colors duration-200" />
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next slide"
            className="group absolute right-0 top-0 z-10 h-full w-1/2 flex items-center justify-end px-3 md:px-6 focus:outline-none"
          >
            <MdChevronRight className="text-white/0 md:group-hover:text-white/80 text-4xl drop-shadow transition-colors duration-200" />
          </button>
        </>
      )}

      {/* Slide navigation dots */}
      {activeSlides.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-1">
          {activeSlides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentImageIndex(index)}
              aria-label={`Go to slide ${index + 1}`}
              className="group flex items-center justify-center p-2"
            >
              <span
                className={`block h-2 rounded-full transition-all duration-300 ${
                  index === currentImageIndex
                    ? "bg-white w-6"
                    : "bg-white/50 w-2 group-hover:bg-white/70"
                }`}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
