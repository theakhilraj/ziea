import React from 'react';
import RevealOnScroll from '../../ui/RevealOnScroll';
import Link from 'next/link';
import { Button } from '../../ui/Button';
import { getCategories } from '@/utils/categories';

export default async function EditorialCTA() {
  const categories = (await getCategories()).slice(0, 4);

  return (
    <section className="pt-20 pb-12 bg-white text-center">
      <div className="max-w-4xl mx-auto px-page">
        <RevealOnScroll>
          <div className="w-16 h-px bg-primary mx-auto mb-10"></div>
          <h3 className="cormorant text-4xl md:text-5xl text-[#211a15] mb-6">Experience the Comfort</h3>
          <p className="font-jost text-on-surface-variant mb-10 max-w-2xl mx-auto md:text-lg">
            Invite the tranquility of the backwaters into your home with our latest collection of hand-loomed essentials. Designed for the quiet moments that matter most.
          </p>
          <Link href="/collections" className="inline-block">
            <Button variant="auth-primary" className="!w-auto px-12 uppercase tracking-widest text-sm">
              Shop the Collection
            </Button>
          </Link>

          {categories && categories.length > 0 && (
            <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8">
              {categories.map((category) => (
                <Link
                  key={category.id}
                  href={`/collections?category=${category.id}`}
                  className="flex justify-center items-center cormorant text-xl text-on-surface-variant hover:text-primary transition-colors"
                >
                  {category.name}
                </Link>
              ))}
            </div>
          )}
        </RevealOnScroll>
      </div>
    </section>
  );
}
