import React from 'react';
import { Accordion } from '@/components/ui/Accordion';

interface ProductDetailsProps {
  material?: string;
  careInstructions?: string;
  shippingInfo?: string;
  contents?: string;
}

/**
 * Collapsible product details (Material, Care Instructions, Shipping & Returns,
 * Contents). Rendered below the size/quantity/Add-to-Cart actions.
 */
export default function ProductDetails({
  material,
  careInstructions,
  shippingInfo,
  contents,
}: ProductDetailsProps) {
  const items = [
    material && {
      title: 'Material',
      content: (
        <p className="font-jost text-[15px] text-[#44483f] leading-relaxed">{material}</p>
      ),
    },
    careInstructions && {
      title: 'Care Instructions',
      content: (
        <div className="rich-text-content" dangerouslySetInnerHTML={{ __html: careInstructions }} />
      ),
    },
    shippingInfo && {
      title: 'Shipping & Returns',
      content: (
        <div className="rich-text-content" dangerouslySetInnerHTML={{ __html: shippingInfo }} />
      ),
    },
    contents && {
      title: 'Product Details',
      content: (
        <div className="rich-text-content" dangerouslySetInnerHTML={{ __html: contents }} />
      ),
    },
  ].filter(Boolean) as { title: string; content: React.ReactNode }[];

  if (items.length === 0) return null;

  // h2 keeps the product-page heading order sequential: page h1 (product name)
  // → h2 (these detail sections) → h2 (You May Also Like) → h3 (product cards).
  return <Accordion items={items} headingLevel="h2" />;
}
