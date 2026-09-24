"use client";

import React, { useState, useTransition } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MdOutlineDelete, MdOutlineLocalShipping } from 'react-icons/md';
import type { ListItem } from './ListManager';
import { QuantityStepper } from '@/components/ui/QuantityStepper';
import { Button } from '@/components/ui/Button';
import { updateCartQty, removeCartItem, addToCart } from '@/app/actions/cart';
import { removeWishlistItem } from '@/app/actions/wishlist';
import { notifyCountsChanged } from '@/utils/counts';
import { productPath } from '@/utils/slug';

interface PopulatedListProps {
  items: ListItem[];
  type: 'wishlist' | 'cart';
}

export default function PopulatedList({ items, type }: PopulatedListProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Optimistic per-item quantity so the stepper feels instant before refresh.
  const [pendingQty, setPendingQty] = useState<Record<string, number>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  // Items hidden optimistically (removed/moved) so they vanish instantly while
  // the DB write + subtotal reconcile happen in the background.
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());

  const run = (id: string, action: () => Promise<unknown>) => {
    setBusyId(id);
    startTransition(async () => {
      await action();
      notifyCountsChanged();
      router.refresh();
      setBusyId(null);
    });
  };

  // Optimistic remove/move: hide the item now, persist + reconcile after.
  const removeOptimistic = (id: string, action: () => Promise<unknown>) => {
    setHiddenIds((prev) => new Set(prev).add(id));
    startTransition(async () => {
      await action();
      notifyCountsChanged();
      router.refresh();
    });
  };

  const handleQtyChange = (item: ListItem, next: number) => {
    setPendingQty((prev) => ({ ...prev, [item.id]: next }));
    run(item.id, () => updateCartQty(item.id, next));
  };

  const visibleItems = items.filter((i) => !hiddenIds.has(i.id));

  return (
    <div
      className={`grid grid-cols-2 gap-x-4 gap-y-10 ${type === 'wishlist' ? 'md:grid-cols-3 lg:grid-cols-4' : 'md:grid-cols-3'
        }`}
    >
      {visibleItems.map((item) => {
        const qty = pendingQty[item.id] ?? item.quantity ?? 1;
        const rowBusy = busyId === item.id && isPending;
        return (
          <div key={item.id} className="flex flex-col group relative">
            {/* Image — matches the collections ProductCard (4:5, surface, sizes) */}
            <div className="relative overflow-hidden rounded-xl bg-surface shadow-[0px_2px_16px_rgba(44,56,41,0.08)] aspect-[4/5] mb-4">
              <Link href={productPath(item.productCode, item.categorySlug)} className="block absolute inset-0">
                <Image
                  src={item.image}
                  alt={item.title}
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </Link>
              <button
                type="button"
                aria-label="Remove item"
                disabled={rowBusy}
                onClick={(e) => {
                  e.preventDefault();
                  removeOptimistic(
                    item.id,
                    () =>
                      type === 'cart'
                        ? removeCartItem(item.id)
                        : removeWishlistItem(item.productId),
                  );
                }}
                className="absolute top-3 right-3 w-9 h-9 bg-background/80 backdrop-blur rounded-full flex items-center justify-center shadow-sm transition-all hover:scale-110 active:scale-95 z-10 text-[#2C3829] disabled:opacity-50"
              >
                <MdOutlineDelete className="text-[18px]" />
              </button>
            </div>

            <div className="space-y-1">
              <Link href={productPath(item.productCode, item.categorySlug)}>
                <h3 className="font-label-md text-text line-clamp-2 hover:text-primary transition-colors">{item.title}</h3>
              </Link>
              {item.variant ? (
                <p className="font-jost text-[13px] text-on-surface-variant truncate">
                  {type === 'cart' ? `Size: ${item.variant}` : item.variant}
                </p>
              ) : null}

              <span className="block text-lg font-semibold text-text">{item.price}</span>

              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[#2C3829] mt-1">
                <MdOutlineLocalShipping className="text-[16px] text-[#2C3829]" />
                Free delivery
              </p>

              {type === 'cart' ? (
                <div className="pt-2">
                  <QuantityStepper value={qty} onChange={(n) => handleQtyChange(item, n)} min={1} />
                </div>
              ) : null}

              {type === 'wishlist' ? (
                <Button
                  type="button"
                  variant="auth-primary"
                  disabled={rowBusy}
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    removeOptimistic(item.id, async () => {
                      await addToCart(item.productId, null, 1);
                      await removeWishlistItem(item.productId);
                    });
                  }}
                  className="mt-3 !py-3 !text-base disabled:opacity-50"
                >
                  Move to Cart
                </Button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
