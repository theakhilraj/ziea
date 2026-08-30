import Link from "next/link";
import SmartImage from "@/components/ui/SmartImage";
import { getBranding } from "@/utils/branding.server";
import {
  MdArrowForward,
  MdFavoriteBorder,
  MdOutlineTexture,
  MdOutlineStraighten,
  MdOutlineLocalShipping,
  MdOutlineLock,
} from "react-icons/md";
import { buttonBase, buttonVariants } from "@/components/ui/Button";

const BADGES = [
  { icon: MdFavoriteBorder, label: "Handcrafted with Love" },
  { icon: MdOutlineTexture, label: "Premium Fabrics" },
  { icon: MdOutlineStraighten, label: "Made to Measure" },
  { icon: MdOutlineLocalShipping, label: "On-time Delivery" },
  { icon: MdOutlineLock, label: "Secure Payment" },
];

export default async function StudioHero() {
  // Optional-chain: a branding cache entry created before this section existed
  // (stale unstable_cache during dev HMR or a fresh deploy) won't have
  // `customisation` until it revalidates — fall back to the gradient, don't crash.
  const { customisation } = await getBranding();
  const heroDesktop = customisation?.heroDesktop ?? null;
  const heroMobile = customisation?.heroMobile ?? null;

  return (
    <section className="relative flex min-h-[calc(100svh-4rem)] w-full items-center overflow-hidden md:block md:min-h-0">
      {/* Admin-managed hero backgrounds (Branding → Customisation Studio):
          a tall mobile image and a wide desktop image, each behind a left→right
          readability scrim; each falls back to a branded gradient. */}
      <div className="absolute inset-0 z-0" aria-hidden="true">
        {/* Mobile (tall) background */}
        <div className="absolute inset-0 md:hidden">
          {heroMobile ? (
            <SmartImage
              src={heroMobile.url}
              alt=""
              cropX={heroMobile.cropX}
              cropY={heroMobile.cropY}
              zoom={heroMobile.zoom}
              sizes="100vw"
              priority
              quality={68}
              className="opacity-40"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-surface via-background to-primary/20" />
          )}
        </div>
        {/* Desktop (wide) background */}
        <div className="absolute inset-0 hidden md:block">
          {heroDesktop ? (
            <SmartImage
              src={heroDesktop.url}
              alt=""
              cropX={heroDesktop.cropX}
              cropY={heroDesktop.cropY}
              zoom={heroDesktop.zoom}
              sizes="100vw"
              priority
              quality={68}
              className="opacity-40"
            />
          ) : (
            <div className="h-full w-full bg-gradient-to-br from-surface via-background to-primary/20" />
          )}
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/40 md:to-transparent" />
      </div>

      <div className="relative z-10 w-full px-page py-12 md:py-16">
        <div className="max-w-2xl">
          <h1 className="cormorant text-4xl leading-tight text-primary-dark md:text-6xl">
            Your Dream Outfit. Your Way.
          </h1>
          <p className="mt-6 font-jost text-base leading-relaxed text-muted md:text-lg">
            Create something uniquely yours with ZIEA. Share your inspiration, work with our
            designers, or customise a ZIEA design to match your style, fit and occasion.
          </p>

          <Link
            href="#experience"
            className={`${buttonBase} ${buttonVariants["auth-primary"]} mt-9 w-full gap-2 sm:w-auto sm:px-10`}
          >
            Start Your Customisation Journey
            <MdArrowForward size={18} />
          </Link>

          {/* Trust badges — desktop only (hidden on mobile) */}
          <div className="mt-14 hidden gap-6 border-t border-border pt-8 md:grid md:grid-cols-5">
            {BADGES.map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-2 text-center">
                <Icon className="text-2xl text-primary" />
                <span className="font-jost text-[10px] uppercase tracking-[0.15em] text-muted">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
