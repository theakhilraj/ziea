"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MdFavorite, MdOutlineFavoriteBorder, MdOutlineLocalShipping } from "react-icons/md";
import type { ProductCardProps } from "@/types/product";
import { getBadgeColor } from "@/utils/badge";
import { deliveryByLabel } from "@/utils/price";
import { productPath } from "@/utils/slug";
import { Button } from "../../ui/Button";
import SmartImage from "../../ui/SmartImage";
import { addToCart } from "@/app/actions/cart";
import { notifyCountsChanged } from "@/utils/counts";
import { useWishlist } from "@/components/client/product/WishlistProvider";

// Standard vivid red for the "liked" wishlist state (common e-commerce heart red).
const WISHLIST_RED = "#E63946";

export default function ProductCard({
  id,
  productCode,
  categorySlug,
  title,
  originalPrice,
  discountedPrice,
  imageUrl,
  altText,
  badge,
  cropX = 50,
  cropY = 50,
  zoom = 100,
  deliveryDays,
  priority = false,
}: ProductCardProps) {
  const deliveryLabel = deliveryByLabel(deliveryDays);
  const router = useRouter();
  // Heart state comes from the client WishlistProvider (no server cookie read),
  // so the grids stay statically renderable.
  const { isWishlisted, toggle } = useWishlist();
  const isFavorite = isWishlisted(id);
  const [isAdded, setIsAdded] = useState(false);
  const [, startTransition] = useTransition();

  const handleToggleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggle(id);
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Optimistic: show "Added!" immediately; persist in the background so the
    // click feels instant regardless of network latency.
    setIsAdded(true);
    setTimeout(() => setIsAdded(false), 2000);
    startTransition(async () => {
      const res = await addToCart(id, null, 1);
      if (res && "error" in res && res.error === "unauthenticated") {
        setIsAdded(false);
        router.push("/login");
        return;
      }
      notifyCountsChanged();
    });
  };

  return (
    <Link
      href={productPath(productCode, categorySlug)}
      className="flex flex-col space-y-4 group bg-white p-2 rounded-xl"
    >
      {/* Product Image */}
      <div className="relative rounded-xl overflow-hidden aspect-[4/5] shadow-[0px_2px_16px_rgba(44,56,41,0.08)]">
        <div className="absolute inset-0 group-hover:scale-105 transition-transform duration-700 ease-in-out">
          <SmartImage
            src={imageUrl}
            alt={altText ?? title}
            cropX={cropX}
            cropY={cropY}
            zoom={zoom}
            priority={priority}
            sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
          />
        </div>

        {/* Admin-set badge */}
        {badge && (
          <>
            {/* Mobile: diagonal corner ribbon across the top-left corner */}
            <div className="md:hidden absolute top-0 left-0 h-20 w-20 overflow-hidden z-10 pointer-events-none">
              <span
                className="jost absolute top-[16px] -left-[26px] w-[120px] -rotate-45 py-1 text-center text-[9px] font-semibold uppercase tracking-wide text-white shadow-md"
                style={{ backgroundColor: getBadgeColor(badge) }}
              >
                {badge}
              </span>
            </div>

            {/* Desktop: flat pill (top-left) */}
            <span
              className="jost hidden md:block absolute top-3 left-3 text-white px-3 py-1 rounded-full text-[11px] font-semibold tracking-wider uppercase shadow-sm z-10"
              style={{ backgroundColor: getBadgeColor(badge) }}
            >
              {badge}
            </span>
          </>
        )}

        {/* Wishlist */}
        <button
          type="button"
          aria-label={isFavorite ? "Remove from wishlist" : "Add to wishlist"}
          onClick={handleToggleWishlist}
          className="absolute top-3 right-3 w-10 h-10 rounded-full bg-background/80 backdrop-blur flex items-center justify-center shadow-sm hover:scale-110 active:scale-95 transition-all"
        >
          {isFavorite ? (
            <MdFavorite className="text-2xl" style={{ color: WISHLIST_RED }} />
          ) : (
            <MdOutlineFavoriteBorder
              className="text-2xl"
              style={{ color: "var(--color-primary-dark)" }}
            />
          )}
        </button>
      </div>

      {/* Product Details */}
      <div className="space-y-1">
        <h3 className="font-label-md text-text line-clamp-2 min-h-[2.5rem]">
          {title}
        </h3>

        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-lg font-semibold text-text">
            ₹ {discountedPrice.toLocaleString("en-IN")}
          </span>

          {originalPrice > discountedPrice && (
            <span className="text-sm text-gray-600 line-through">
              ₹ {originalPrice.toLocaleString("en-IN")}
            </span>
          )}
        </div>

        {deliveryLabel && (
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[#2C3829] mt-1.5">
            <MdOutlineLocalShipping className="text-[16px] text-[#2C3829]" />
            Deliverable by {deliveryLabel}
          </p>
        )}

        {/* Add to Cart — same deep-forest style as the Hero "Shop Now" button */}
        {/* <Button
          type="button"
          variant="auth-primary"
          onClick={handleAddToCart}
          className={`gap-2 mt-3 !py-3 !text-base ${isAdded ? "!bg-primary" : ""}`}
        >
          {isAdded ? "Added!" : "Add to Cart"}
        </Button> */}
      </div>
    </Link>
  );
}
