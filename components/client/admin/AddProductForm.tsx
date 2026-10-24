"use client";

import React, { useState, useRef } from 'react';
import { MdCameraAlt, MdClose, MdAdd, MdRemove, MdStar, MdStarBorder, MdArrowBack, MdArrowForward, MdKeyboardArrowDown } from 'react-icons/md';
import { createClient } from '@/utils/supabase/client';
import { revalidateStorefront } from '@/app/actions/revalidate';
import { useRouter } from 'next/navigation';
import RichTextarea from '@/components/ui/RichTextarea';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import Toast from '@/components/ui/Toast';
import { z } from 'zod';

interface Category {
  id: string;
  name: string;
}

interface ProductImage {
  id: string;
  file?: File;
  url: string;
  isHighlight: boolean;
  cropX: number;
  cropY: number;
  zoom?: number;
}

export default function AddProductForm({ categories = [], initialData }: { categories?: Category[], initialData?: any }) {
  const router = useRouter();
  const supabase = createClient();

  const [toast, setToast] = useState({ show: false, message: '', error: false });
  const showToast = (message: string, error = true) => {
    setToast({ show: true, message, error });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitAction, setSubmitAction] = useState<'draft' | 'publish' | null>(null);
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [categoryId, setCategoryId] = useState(initialData?.category_id || categories[0]?.id || '');
  const [originalPrice, setOriginalPrice] = useState(initialData?.original_price?.toString() || '');
  const [discountedPrice, setDiscountedPrice] = useState(initialData?.discounted_price?.toString() || '');
  const [material, setMaterial] = useState(initialData?.material || '');
  const [careInstructions, setCareInstructions] = useState(initialData?.care_instructions || '');
  const [shippingInfo, setShippingInfo] = useState(initialData?.shipping_info || '');
  const [contents, setContents] = useState(initialData?.contents || '');

  // Delivery lead time in days — the storefront computes "deliverable by" as today + this,
  // so it always stays current. Defaults to 7.
  const [deliveryDays, setDeliveryDays] = useState(
    initialData?.delivery_days != null ? String(initialData.delivery_days) : '7'
  );

  // Badges
  const [productBadge, setProductBadge] = useState(initialData?.badges?.[0] || '');
  const [universalBadges, setUniversalBadges] = useState(['Bestseller', '50% OFF', 'New Arrival', 'Limited Edition']);
  const [activeImageId, setActiveImageId] = useState<string | null>(null);

  // Predefined Sizes S, M, L, XL, XXL
  const defaultSizes = [
    { size: 'S', quantity: 0 },
    { size: 'M', quantity: 0 },
    { size: 'L', quantity: 0 },
    { size: 'XL', quantity: 0 },
    { size: 'XXL', quantity: 0 },
  ];

  const [sizes, setSizes] = useState(() => {
    if (initialData?.sizes && Array.isArray(initialData.sizes)) {
      return defaultSizes.map(ds => {
        const found = initialData.sizes.find((s: any) => s.size === ds.size);
        return found ? { ...ds, quantity: found.quantity } : ds;
      });
    }
    return defaultSizes;
  });

  const [images, setImages] = useState<ProductImage[]>(() => {
    if (initialData?.images && Array.isArray(initialData.images)) {
      return initialData.images.map((img: any) => ({
        id: Math.random().toString(36).substring(7),
        url: img.url,
        isHighlight: img.is_highlight || false,
        cropX: img.crop_x ?? 50,
        cropY: img.crop_y ?? 50,
        zoom: img.zoom ?? 100
      }));
    }
    return [];
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const files = Array.from(e.target.files);

    const newImages = files.map(file => ({
      id: Math.random().toString(36).substring(7),
      file,
      url: URL.createObjectURL(file),
      isHighlight: false,
      cropX: 50,
      cropY: 50,
      zoom: 100
    }));

    setImages(prev => {
      const next = [...prev, ...newImages];
      if (prev.length === 0 && next.length > 0) {
        setActiveImageId(next[0].id);
      }
      return next;
    });
  };

  const removeImage = (id: string) => {
    setImages(prev => {
      const updated = prev.filter(img => img.id !== id);
      if (updated.length > 0 && !updated.some(img => img.isHighlight)) {
        updated[0].isHighlight = true;
      }
      return updated;
    });
  };

  const setHighlight = (id: string) => {
    setImages(prev => prev.map(img => ({
      ...img,
      isHighlight: img.id === id
    })));
  };

  const moveImage = (index: number, direction: 'left' | 'right') => {
    setImages(prev => {
      const updated = [...prev];
      if (direction === 'left' && index > 0) {
        [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
      } else if (direction === 'right' && index < updated.length - 1) {
        [updated[index + 1], updated[index]] = [updated[index], updated[index + 1]];
      }
      return updated;
    });
  };

  const updateCrop = (id: string, axis: 'cropX' | 'cropY' | 'zoom', value: number) => {
    setImages(prev => prev.map(img =>
      img.id === id ? { ...img, [axis]: value } : img
    ));
  };

  const updateSize = (index: number, delta: number) => {
    setSizes(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], quantity: Math.max(0, updated[index].quantity + delta) };
      return updated;
    });
  };

  const updateSizeDirectly = (index: number, value: string) => {
    setSizes(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], quantity: Math.max(0, parseInt(value) || 0) };
      return updated;
    });
  };

  const publishSchema = z.object({
    name: z.string().min(1, 'Product Name is required'),
    categoryId: z.string().min(1, 'Category must be selected'),
    originalPrice: z.number().min(0.01, 'Original Price must be greater than 0'),
    discountedPrice: z.number().nullable().optional(),
    description: z.string().min(1, 'Description is required'),
    material: z.string().min(1, 'Material is required'),
    careInstructions: z.string().min(1, 'Care Instructions are required'),
    sizes: z.array(z.object({
      size: z.string(),
      quantity: z.number()
    })).refine(sizes => sizes.some(s => s.quantity > 0), {
      message: 'At least one inventory size must have a quantity greater than 0'
    })
  });

  const submitForm = async (isDraft: boolean = false) => {
    if (images.length > 0 && !categoryId) {
      showToast('A Category must be selected to upload your images.', true);
      return;
    }

    if (!isDraft) {
      if (!categoryId) {
        showToast('Category must be selected to publish.', true);
        return;
      }
      if (images.length < 3) {
        showToast('Please upload at least 3 images for the product gallery to publish.', true);
        return;
      }

      const parseResult = publishSchema.safeParse({
        name,
        categoryId,
        originalPrice: parseFloat(originalPrice) || 0,
        discountedPrice: parseFloat(discountedPrice) || null,
        description,
        material,
        careInstructions,
        sizes
      });

      if (!parseResult.success) {
        showToast('Validation Error:\n' + parseResult.error.issues.map((e: any) => e.message).join('\n'), true);
        return;
      }
    }

    setIsSubmitting(true);
    setSubmitAction(isDraft ? 'draft' : 'publish');
    try {
      const selectedCategory = categories.find(c => c.id === categoryId);
      const categoryNameForFolder = selectedCategory ? selectedCategory.name.toLowerCase().replace(/[^a-z0-9]/g, '-') : 'uncategorized';
      const cdnFolder = `products/${categoryNameForFolder}`;

      // 1. Upload Images
      const uploadedImages = [];
      for (const img of images) {
        let finalUrl = img.url;
        if (img.file) {
          const formData = new FormData();
          formData.append('file', img.file);
          formData.append('folder', cdnFolder);

          const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Failed to upload image');
          finalUrl = data.url;
        }
        uploadedImages.push({
          url: finalUrl,
          is_highlight: img.isHighlight,
          crop_x: img.cropX,
          crop_y: img.cropY,
          zoom: img.zoom || 100
        });
      }

      // 2. Save Product
      const payload = {
        name,
        description,
        category_id: categoryId,
        original_price: parseFloat(originalPrice) || null,
        discounted_price: parseFloat(discountedPrice) || null,
        material,
        care_instructions: careInstructions,
        shipping_info: shippingInfo,
        contents,
        delivery_days: parseInt(deliveryDays, 10) || 7,
        is_published: !isDraft,
        status: isDraft ? 'draft' : 'published',
        sizes,
        images: uploadedImages,
        badges: productBadge ? [productBadge] : []
      };

      const { data: { user } } = await supabase.auth.getUser();

      if (initialData?.id) {
        const { error } = await supabase.from('products').update(payload).eq('id', initialData.id);
        if (error) throw error;

        await supabase.from('activity_logs').insert({
          user_id: user?.id,
          type: 'Product Updated',
          description: `Admin updated product "${name}"`
        });
      } else {
        const { error } = await supabase.from('products').insert([payload]);
        if (error) throw error;

        await supabase.from('activity_logs').insert({
          user_id: user?.id,
          type: 'Product Added',
          description: `Admin added product "${name}"`
        });
      }

      await revalidateStorefront('products');
      showToast(`Product ${isDraft ? 'saved as draft' : 'published'} successfully!`, false);
      router.push('/admin/products');

    } catch (err: any) {
      showToast(err.message || 'Error saving product', true);
    } finally {
      setIsSubmitting(false);
      setSubmitAction(null);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <Toast show={toast.show} message={toast.message} error={toast.error} />
      {/* Left Column: Data & Details */}
      <div className="lg:col-span-7 xl:col-span-8 space-y-6">

        {/* Core Details */}
        <section className="space-y-6">
          <h3 className="font-jost text-lg font-semibold text-[#2C3829] border-b border-[#d6c3b3]/30 pb-3">Core Details</h3>

          <div className="space-y-4">
            <div>
              <label className="font-jost text-sm font-medium text-[#2C3829] mb-1 block">Product Name</label>
              <input
                value={name} onChange={e => setName(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-[#d6c3b3] rounded-xl font-jost font-normal text-base text-[#2C3829] transition-all outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 hover:border-primary/50 duration-200"
                placeholder="e.g. Malabar Mist Linen Kaftan"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Category"
                value={categoryId}
                onChange={setCategoryId}
                placeholder="Select a category"
                options={categories.map(c => ({ value: c.id, label: c.name }))}
              />
              <Select
                label="Product Badge"
                value={productBadge}
                onChange={setProductBadge}
                placeholder="Select a badge"
                options={universalBadges.map(b => ({ value: b, label: b }))}
                allowAdd={true}
                onAdd={(newBadge) => {
                  if (!universalBadges.includes(newBadge)) {
                    setUniversalBadges(prev => [...prev, newBadge]);
                  }
                  setProductBadge(newBadge);
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="font-jost text-sm font-medium text-[#2C3829] mb-1 block">Original Price (₹)</label>
                <input
                  type="number" value={originalPrice} onChange={e => setOriginalPrice(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-[#d6c3b3] rounded-xl font-jost font-normal text-base text-[#2C3829] transition-all outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 hover:border-primary/50 duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="2999"
                />
              </div>
              <div>
                <label className="font-jost text-sm font-medium text-[#2C3829] mb-1 block">Discounted Price (₹)</label>
                <input
                  type="number" value={discountedPrice} onChange={e => setDiscountedPrice(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-[#d6c3b3] rounded-xl font-jost font-normal text-base text-[#2C3829] transition-all outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 hover:border-primary/50 duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="2499"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="font-jost text-sm font-medium text-[#2C3829] mb-1 block">Delivery In (Days)</label>
                <input
                  type="number" min="0" value={deliveryDays}
                  onChange={e => setDeliveryDays(e.target.value)}
                  className="w-full px-4 py-3 bg-white border border-[#d6c3b3] rounded-xl font-jost font-normal text-base text-[#2C3829] transition-all outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 hover:border-primary/50 duration-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  placeholder="7"
                />
                <p className="text-xs text-[#2C3829]/50 mt-1">Storefront shows "Deliverable by" as today + this many days.</p>
              </div>
            </div>

            {/* Rich Text Description */}
            <RichTextarea
              label="Description"
              value={description}
              onChange={setDescription}
              placeholder="Describe the product..."
              minHeight="140px"
            />
          </div>
        </section>

        {/* Inventory & Settings */}
        <section className="space-y-6">
          <h3 className="font-jost text-lg font-semibold text-[#2C3829] border-b border-[#d6c3b3]/30 pb-3">Inventory (Sizes)</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sizes.map((s, index) => (
              <div key={s.size} className="bg-[#FAF7F2] border border-[#d6c3b3] rounded-lg p-3 flex flex-row items-center justify-between gap-4">
                <span className="font-jost font-semibold text-[#2C3829] min-w-[2.5rem] text-center">{s.size}</span>
                <div className="flex-1 flex items-center justify-between bg-white border border-[#d6c3b3] rounded-lg font-jost transition-all focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/5 hover:border-primary/50 duration-200 overflow-hidden">
                  <button type="button" onClick={() => updateSize(index, -1)} className="px-3 py-2 text-[#2C3829]/70 hover:bg-gray-50 active:bg-gray-100 transition-colors shrink-0"><MdRemove /></button>
                  <input
                    type="number"
                    value={s.quantity}
                    onChange={(e) => updateSizeDirectly(index, e.target.value)}
                    className="w-full text-center py-2 bg-transparent border-none text-base text-[#2C3829] outline-none focus:ring-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none min-w-[40px]"
                  />
                  <button type="button" onClick={() => updateSize(index, 1)} className="px-3 py-2 text-[#2C3829]/70 hover:bg-gray-50 active:bg-gray-100 transition-colors shrink-0"><MdAdd /></button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Extended Information */}
        <section className="space-y-6">
          <h3 className="font-jost text-lg font-semibold text-[#2C3829] border-b border-[#d6c3b3]/30 pb-3">Extended Information</h3>
          <div className="space-y-4">
            <div>
              <label className="font-jost text-sm font-medium text-[#2C3829] mb-1 block">Material</label>
              <input
                value={material} onChange={e => setMaterial(e.target.value)}
                className="w-full px-4 py-3 bg-white border border-[#d6c3b3] rounded-xl font-jost font-normal text-base text-[#2C3829] transition-all outline-none focus:border-primary focus:ring-4 focus:ring-primary/5 hover:border-primary/50 duration-200"
                placeholder="e.g. 100% Organic Linen"
              />
            </div>

            {/* Rich Text Fields */}
            <RichTextarea
              label="Care Instructions"
              value={careInstructions}
              onChange={setCareInstructions}
              placeholder="e.g. Machine wash cold, gentle cycle..."
              minHeight="120px"
            />
            <RichTextarea
              label="Shipping & Returns"
              value={shippingInfo}
              onChange={setShippingInfo}
              placeholder="e.g. Free shipping on all orders. Returns within 2 days..."
              minHeight="120px"
            />
            <RichTextarea
              label="Contents"
              value={contents}
              onChange={setContents}
              placeholder="e.g. This is a 3-piece set with pants and dupatta..."
              minHeight="120px"
            />
          </div>
        </section>
      </div>

      {/* Right Column: Visuals & Actions */}
      <div className="lg:col-span-5 xl:col-span-4 space-y-6">
        {/* Image Gallery */}
        <section className="bg-white p-6 rounded-xl border border-[#d6c3b3]/30 shadow-sm space-y-6 sticky top-32">
          <div className="flex justify-between items-end border-b border-[#d6c3b3]/30 pb-3">
            <div>
              <h3 className="font-jost text-lg font-semibold text-[#2C3829]">Product Gallery</h3>

              {/* Resolution Hints */}
              <div className="flex gap-2 mt-2 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[10px] font-jost font-semibold text-[#2C3829]/50 uppercase tracking-widest bg-[#f8f5f1] border border-[#d6c3b3]/40 px-2 py-0.5 rounded-full">
                  🖥 1080 × 1350 px
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-jost font-semibold text-[#2C3829]/50 uppercase tracking-widest bg-[#f8f5f1] border border-[#d6c3b3]/40 px-2 py-0.5 rounded-full">
                  📱 4:5 Aspect Ratio
                </span>
              </div>
              <p className="text-xs text-[#2C3829]/70 mt-1">Upload min. 3 high-res images</p>
            </div>
            <Button
              type="button"
              variant="auth-social"
              onClick={() => {
                if (!categoryId) {
                  showToast('Please select a Category first to organize your images.', true);
                  return;
                }
                fileInputRef.current?.click();
              }}
              className="!w-auto !py-2 !px-5 !text-xs !gap-1"
            >
              Add
            </Button>
          </div>

          <input
            ref={fileInputRef}
            accept="image/jpeg,image/png"
            className="hidden"
            multiple
            type="file"
            onChange={handleImageUpload}
          />

          {images.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-[#d6c3b3] bg-[#FAF7F2] rounded-xl cursor-pointer hover:bg-[#f2eadc] transition-all"
            >
              <MdCameraAlt className="text-4xl text-[#2C3829]/50 mb-2" />
              <p className="font-jost font-medium text-sm text-[#2C3829]/70">Tap to upload photos</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Dynamic Grid */}
              <div className="grid grid-cols-2 gap-3">
                {images.map((img, idx) => (
                  <div
                    key={img.id}
                    className={`relative group aspect-[4/5] rounded-xl overflow-hidden shadow-sm border-2 ${img.id === activeImageId ? 'border-primary' : 'border-[#d6c3b3]/30'} bg-[#FAF7F2] cursor-pointer`}
                    onClick={() => setActiveImageId(img.id)}
                  >
                    <img
                      src={img.url}
                      alt={`Preview ${idx}`}
                      draggable={false}
                      className="absolute object-cover pointer-events-none select-none max-w-none transition-all duration-200"
                      style={{
                        width: `${((img.zoom || 100) / 100) * 100}%`,
                        height: `${((img.zoom || 100) / 100) * 100}%`,
                        left: `${img.cropX}%`,
                        top: `${img.cropY}%`,
                        transform: 'translate(-50%, -50%)',
                        transformOrigin: 'center center'
                      }}
                    />

                    {/* Overlay Controls */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-2">
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeImage(img.id);
                          }}
                          className="w-7 h-7 rounded-full bg-white/80 text-red-600 hover:bg-white flex items-center justify-center"
                        >
                          <MdClose className="text-sm" />
                        </button>
                      </div>
                      <div className="flex justify-center gap-1">
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveImage(idx, 'left');
                            }}
                            className="w-7 h-7 rounded-full bg-white/80 text-gray-700 hover:bg-white flex items-center justify-center"
                          >
                            <MdArrowBack className="text-sm" />
                          </button>
                        )}
                        {idx < images.length - 1 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              moveImage(idx, 'right');
                            }}
                            className="w-7 h-7 rounded-full bg-white/80 text-gray-700 hover:bg-white flex items-center justify-center"
                          >
                            <MdArrowForward className="text-sm" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Crop Sliders for Active Image */}
              {activeImageId && images.find(img => img.id === activeImageId) && (
                <div className="bg-[#FAF7F2] p-4 rounded-xl border border-[#d6c3b3]/50 flex flex-col gap-4 mt-2">
                  {(() => {
                    const activeImg = images.find(img => img.id === activeImageId)!;
                    return (
                      <div className="w-full space-y-4">
                        <div>
                          <div className="flex justify-between text-[10px] font-jost text-[#2C3829]/70 mb-1 uppercase tracking-widest">
                            <span>Zoom / Scale (Selected Image)</span>
                            <span>{Math.round(activeImg.zoom || 100)}%</span>
                          </div>
                          <input
                            type="range" min="50" max="250"
                            value={activeImg.zoom ?? 100}
                            onChange={(e) => updateCrop(activeImg.id, 'zoom', Number(e.target.value))}
                            className="w-full accent-[#2C3829] h-1"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] font-jost text-[#2C3829]/70 mb-1 uppercase tracking-widest">
                            <span>Horizontal Pan (Selected Image)</span>
                            <span>{Math.round(activeImg.cropX)}%</span>
                          </div>
                          <input
                            type="range" min="0" max="100"
                            value={activeImg.cropX}
                            onChange={(e) => updateCrop(activeImg.id, 'cropX', Number(e.target.value))}
                            className="w-full accent-[#2C3829] h-1"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] font-jost text-[#2C3829]/70 mb-1 uppercase tracking-widest">
                            <span>Vertical Pan (Selected Image)</span>
                            <span>{Math.round(activeImg.cropY)}%</span>
                          </div>
                          <input
                            type="range" min="0" max="100"
                            value={activeImg.cropY}
                            onChange={(e) => updateCrop(activeImg.id, 'cropY', Number(e.target.value))}
                            className="w-full accent-[#2C3829] h-1"
                          />
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons Underneath Gallery */}
          <div className="pt-6 border-t border-[#d6c3b3]/30 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => submitForm(false)}
              disabled={isSubmitting}
              className="w-full h-12 bg-[#2C3829] text-white rounded-full font-jost text-sm font-bold uppercase tracking-widest shadow-md transition-transform active:scale-[0.98] hover:opacity-90 disabled:opacity-50"
            >
              {isSubmitting && submitAction === 'publish' ? 'Publishing...' : initialData ? 'Update Product' : 'Save & Publish'}
            </button>
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="auth-social"
                onClick={() => submitForm(true)}
                disabled={isSubmitting}
                className="!text-[#2C3829] !font-bold !uppercase !tracking-widest !text-[11px] !py-2.5"
              >
                {isSubmitting && submitAction === 'draft' ? 'Drafting...' : initialData ? 'Update Draft' : 'Save as Draft'}
              </Button>
              <Button
                type="button"
                variant="auth-social"
                onClick={() => router.push('/admin/products')}
                disabled={isSubmitting}
                className="!text-red-600 !font-bold !uppercase !tracking-widest !text-[11px] !py-2.5 hover:!bg-red-50/50"
              >
                Cancel
              </Button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}