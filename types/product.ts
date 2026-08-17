export interface Category {
    id: string;
    name: string;
    slug?: string;
}

export interface ProductImage {
    url: string;
    crop_x?: number;
    crop_y?: number;
    zoom?: number;
    is_highlight?: boolean;
}

export interface ProductSize {
    size: string;
    quantity: number;
}

export interface Product {
    id: string;
    product_code: string;

    name: string;
    description: string | null;

    category_id: string | null;
    category?: Category;

    original_price: number | null;
    discounted_price: number | null;

    material: string | null;
    care_instructions: string | null;
    shipping_info: string | null;
    contents: string | null;

    delivery_days: number | null;

    images: ProductImage[];
    sizes: ProductSize[];

    badges: string[];

    is_published: boolean;
    status: "draft" | "published" | "hidden";

    view_count: number;

    created_at: string;
    updated_at: string;
}

export interface ProductCardProps {
    id: string;
    productCode: string;
    /** Category slug for the canonical /collections/{category}/{code} URL.
     *  Omit when unknown (client search/wishlist) — the flat link 308-redirects. */
    categorySlug?: string;
    title: string;
    originalPrice: number;
    discountedPrice: number;
    imageUrl: string;
    altText?: string;
    badge?: string;
    cropX?: number;
    cropY?: number;
    zoom?: number;
    /** Delivery lead time in days; the card computes "Deliverable by" as today + this. */
    deliveryDays?: number | null;
    /** LCP hint: eagerly preload this card's image (use for the first visible row). */
    priority?: boolean;
}