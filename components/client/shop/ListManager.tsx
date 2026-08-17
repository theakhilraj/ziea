"use client";

import React, { useEffect, useState } from 'react';
import UnauthenticatedState from './UnauthenticatedState';
import EmptyState from './EmptyState';
import PopulatedList from './PopulatedList';
import CartCheckoutButton from './CartCheckoutButton';
import { createClient } from '@/utils/supabase/client';
import { formatINR } from '@/utils/price';

export interface ListItem {
  /** Row id: cart_items.id for a cart, wishlist_items.id for a wishlist. */
  id: string;
  /** The underlying product id (used for wishlist/cart mutations). */
  productId: string;
  productCode: string;
  /** Category slug for the canonical /collections/{category}/{code} URL. */
  categorySlug?: string;
  title: string;
  /** Human-readable secondary line (size for cart, material for wishlist). */
  variant: string;
  /** Cart size, when applicable. */
  size?: string | null;
  quantity?: number;
  /** Numeric unit price for totals. */
  priceValue: number;
  /** Preformatted price string for display. */
  price: string;
  image: string;
}

interface ListManagerProps {
  title: string;
  type: 'wishlist' | 'cart';
  icon: React.ReactNode;
  emptyDescription: string;
  /** Real list items for the signed-in user. */
  items?: ListItem[];
}

export default function ListManager({ title, type, icon, emptyDescription, items = [] }: ListManagerProps) {
  const supabase = createClient();
  // null = still resolving the session
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) setIsAuthed(!!session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthed(!!session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  // Resolving auth state
  if (isAuthed === null) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  // Not signed in
  if (!isAuthed) {
    return (
      <div className="relative min-h-[50vh]">
        <UnauthenticatedState title={title} />
      </div>
    );
  }

  // Signed in, but no items
  if (items.length === 0) {
    return (
      <div className="relative min-h-[50vh]">
        <EmptyState title={title} icon={icon} description={emptyDescription} />
      </div>
    );
  }

  // Signed in, with items — subtotal computed from the real items.
  const subtotal = items.reduce(
    (sum, item) => sum + item.priceValue * (item.quantity ?? 1),
    0,
  );
  const subtotalLabel = formatINR(subtotal);

  return (
    <div className="relative min-h-[50vh]">
      {type === 'cart' ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_350px] gap-8 md:gap-10">
          <div className="w-full">
            <PopulatedList items={items} type={type} />
          </div>

          <div className="w-full bg-[#fffcf9] p-4 rounded-xl shadow-[0px_2px_16px_rgba(44,56,41,0.06)] self-start h-fit">
            <h3 className="cormorant text-2xl mb-4 text-[#211a15]">Order Summary</h3>
            <div className="flex justify-between font-jost text-[#44483f] mb-3">
              <span>Subtotal</span>
              <span>{subtotalLabel}</span>
            </div>
            <div className="flex justify-between font-jost text-[#44483f] mb-4 pb-4 border-b border-[#e1e3de]">
              <span>Shipping</span>
              <span>Free</span>
            </div>
            <div className="flex justify-between font-jost font-semibold text-lg mb-6 text-[#211a15]">
              <span>Total</span>
              <span className="text-[#6d8a57]">{subtotalLabel}</span>
            </div>
            <CartCheckoutButton items={items} />
          </div>
        </div>
      ) : (
        <PopulatedList items={items} type={type} />
      )}
    </div>
  );
}
