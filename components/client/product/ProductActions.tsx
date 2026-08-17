"use client";

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MdOutlineLocalShipping, MdOutlineEco, MdOutlineVerifiedUser, MdBolt, MdFavorite, MdOutlineFavoriteBorder } from 'react-icons/md';
import type { ProductSize } from '@/types/product';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { addToCart } from '@/app/actions/cart';
import { notifyCountsChanged } from '@/utils/counts';
import { useWishlist } from '@/components/client/product/WishlistProvider';
import BuyNowModal from '@/components/client/product/BuyNowModal';

// Same vivid red as the product-card heart, for a consistent wishlist state.
const WISHLIST_RED = '#E63946';

interface ProductActionsProps {
  productId: string;
  sizes: ProductSize[];
  productName: string;
  productCode: string;
  unitPrice: number;
  imageUrl: string;
}

export default function ProductActions({
  productId,
  sizes,
  productName,
  productCode,
  unitPrice,
  imageUrl,
}: ProductActionsProps) {
  const router = useRouter();
  const { isWishlisted, toggle: toggleWishlist } = useWishlist();
  const isFavorite = isWishlisted(productId);
  const availableSizes = sizes ?? [];
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [isAdded, setIsAdded] = useState(false);
  const [buyNowOpen, setBuyNowOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const selected = availableSizes.find((s) => s.size === selectedSize) ?? null;
  const maxQty = selected ? Math.max(1, selected.quantity) : 1;

  const handleSelectSize = (size: ProductSize) => {
    if (size.quantity <= 0) return;
    // Toggle: tapping the selected size again clears it.
    setSelectedSize((prev) => (prev === size.size ? null : size.size));
    setQuantity(1);
  };

  // Gate: a size must be selected before adding to cart.
  const canAddToCart = selected !== null;

  const handleAddToCart = () => {
    if (!canAddToCart || !selectedSize) return;
    startTransition(async () => {
      const res = await addToCart(productId, selectedSize, quantity);
      if (res && 'error' in res && res.error === 'unauthenticated') {
        router.push('/login');
        return;
      }
      notifyCountsChanged();
      setIsAdded(true);
      setTimeout(() => setIsAdded(false), 2000);
    });
  };

  return (
    <div className="space-y-6">
      {/* Size Selector */}
      <div className="space-y-4">
        <label className="font-label-md text-on-surface-variant block text-sm font-medium">Select Size</label>
        <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
          {availableSizes.map((size) => {
            const isOutOfStock = size.quantity <= 0;
            const isSelected = selectedSize === size.size;
            return (
              <button
                key={size.size}
                type="button"
                onClick={() => handleSelectSize(size)}
                disabled={isOutOfStock}
                aria-pressed={isSelected}
                className={`flex-none min-w-[3.25rem] px-4 h-11 rounded-full font-jost text-sm font-medium transition-all duration-200 border ${
                  isOutOfStock
                    ? "border-[#d6c3b3]/50 text-[#2C3829]/40 opacity-50 cursor-not-allowed line-through"
                    : isSelected
                      ? "bg-[#2C3829] text-white border-[#2C3829] active:scale-95"
                      : "bg-white text-[#2C3829] border-[#d6c3b3] hover:border-[#2C3829]/50 active:scale-95"
                }`}
              >
                {size.size}
              </button>
            );
          })}
        </div>
        {selected && (
          <p className="text-sm font-semibold text-[#2C3829]">
            {selected.quantity} left in stock
          </p>
        )}
      </div>

      {/* Quantity */}
      <div className="space-y-2">
        <label className="font-label-md text-on-surface-variant block text-sm font-medium">Quantity</label>
        <QuantityStepper
          value={quantity}
          onChange={setQuantity}
          min={1}
          max={maxQty}
        />
      </div>

      {/* Buttons */}
      <div className="pt-2 space-y-3">
        {/* Buy Now — primary express action (opens WhatsApp confirmation) */}
        <button
          type="button"
          onClick={() => canAddToCart && setBuyNowOpen(true)}
          disabled={!canAddToCart}
          className={`w-full rounded-full py-4 font-jost font-medium text-lg flex items-center justify-center gap-2 transition-all shadow-sm ${
            canAddToCart
              ? "bg-[#2C3829] text-white hover:opacity-90 active:scale-[0.98]"
              : "bg-[#2C3829]/40 text-white/80 cursor-not-allowed"
          }`}
        >
          Buy Now
        </button>

        {/* Add to Cart — secondary */}
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={!canAddToCart || isPending}
          className={`w-full rounded-full py-4 font-jost font-medium text-lg border flex items-center justify-center transition-all ${
            isAdded
              ? "bg-primary text-white border-primary"
              : canAddToCart
                ? "border-[#2C3829] text-[#2C3829] hover:bg-[#2C3829]/5 active:scale-[0.98]"
                : "border-[#2C3829]/30 text-[#2C3829]/40 cursor-not-allowed"
          }`}
        >
          {isAdded ? "Added!" : "Add to Cart"}
        </button>

        {/* Add to Wishlist — optimistic toggle; syncs with the grid hearts and
            redirects to /login when signed out (handled by the provider). */}
        <button
          type="button"
          onClick={() => toggleWishlist(productId)}
          aria-pressed={isFavorite}
          className={`w-full rounded-full py-4 font-jost font-medium text-lg border flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
            isFavorite
              ? "border-[#E63946]/40 text-[#E63946] bg-[#E63946]/5"
              : "border-[#2C3829] text-[#2C3829] hover:bg-[#2C3829]/5"
          }`}
        >
          {isFavorite ? (
            <MdFavorite className="text-xl" style={{ color: WISHLIST_RED }} />
          ) : (
            <MdOutlineFavoriteBorder className="text-xl" />
          )}
          {isFavorite ? "In Wishlist" : "Add to Wishlist"}
        </button>
      </div>

      {/* Badges */}
      <div className="flex justify-between items-center py-4 border-b border-[#eee0d6]">
        <div className="flex flex-col items-center gap-1">
          <MdOutlineLocalShipping className="text-[#4c623d]" />
          <span className="text-[10px] text-[#5c5349] uppercase tracking-wider">Free Delivery</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <MdOutlineEco className="text-[#4c623d]" />
          <span className="text-[10px] text-[#5c5349] uppercase tracking-wider">Eco-Friendly</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <MdOutlineVerifiedUser className="text-[#4c623d]" />
          <span className="text-[10px] text-[#5c5349] uppercase tracking-wider">Secure Pay</span>
        </div>
      </div>

      {/* Buy Now confirmation → WhatsApp */}
      <BuyNowModal
        open={buyNowOpen}
        onClose={() => setBuyNowOpen(false)}
        productId={productId}
        productName={productName}
        productCode={productCode}
        unitPrice={unitPrice}
        imageUrl={imageUrl}
        sizes={availableSizes}
        initialSize={selectedSize ?? ""}
        initialQuantity={quantity}
      />
    </div>
  );
}
