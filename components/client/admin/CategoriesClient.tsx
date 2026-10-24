"use client";

import React, { useState, useEffect } from 'react';
import { MdAdd, MdAddCircleOutline, MdEdit, MdDelete, MdClose, MdContentCopy, MdCategory, MdChevronLeft, MdChevronRight } from 'react-icons/md';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import Toast from '@/components/ui/Toast';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { createClient } from '@/utils/supabase/client';
import { revalidateStorefront } from '@/app/actions/revalidate';
import { useRouter } from 'next/navigation';

/** Normalize the DB crop columns into the product crop model (matches SmartImage
 *  + the storefront). image_zoom <= 5 is treated as a legacy ×multiplier. */
function catCrop(cat: any) {
  const cropX = parseInt(cat?.image_pos_x ?? '50', 10);
  const cropY = parseInt(cat?.image_pos_y ?? '50', 10);
  const rawZoom = parseFloat(cat?.image_zoom ?? '100');
  const zoom = !rawZoom ? 100 : rawZoom <= 5 ? rawZoom * 100 : rawZoom;
  return {
    cropX: Number.isNaN(cropX) ? 50 : cropX,
    cropY: Number.isNaN(cropY) ? 50 : cropY,
    zoom,
  };
}

/** Exactly mirrors SmartImage's crop math (object-cover + object-position + scale)
 *  so the admin preview and category cards match the storefront pixel-for-pixel.
 *  Caller supplies a `relative overflow-hidden` frame. */
function CropPreview({ url, cropX, cropY, zoom, alt }: { url: string; cropX: number; cropY: number; zoom: number; alt: string; }) {
  return (
    <img
      src={url}
      alt={alt}
      draggable={false}
      className="absolute inset-0 h-full w-full object-cover select-none pointer-events-none"
      style={{
        objectPosition: `${cropX}% ${cropY}%`,
        transform: zoom !== 100 ? `scale(${zoom / 100})` : undefined,
        transformOrigin: 'center',
      }}
      onError={(e) => (e.currentTarget.style.display = 'none')}
    />
  );
}

export default function CategoriesClient({ initialCategories }: { initialCategories: any[] }) {
  const router = useRouter();
  const supabase = createClient();
  const [categories, setCategories] = useState(initialCategories);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 12;
  const totalPages = Math.ceil(categories.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedCategories = categories.slice(startIndex, startIndex + itemsPerPage);

  // Keep the current page valid when categories are added/removed
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) setCurrentPage(totalPages);
  }, [totalPages, currentPage]);

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<any>(null);

  // Form state
  const [name, setName] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imagePosX, setImagePosX] = useState(50);
  const [imagePosY, setImagePosY] = useState(50);
  const [zoom, setZoom] = useState(100); // percent (100 = fit), matches product crop model
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState({ message: '', show: false, error: false });

  const showToast = (msg: string, isError = false) => {
    setToast({ message: msg, show: true, error: isError });
    setTimeout(() => setToast({ message: '', show: false, error: false }), 4000);
  };

  const handleCopy = () => {
    if (!imageUrl) return;
    navigator.clipboard.writeText(imageUrl);
    showToast("URL copied to clipboard!");
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    // Convert drag pixel delta to percentage
    setImagePosX(prev => Math.max(0, Math.min(100, prev - (dx / 1.5))));
    setImagePosY(prev => Math.max(0, Math.min(100, prev - (dy / 1.5))));
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const openAddModal = () => {
    setActiveCategory(null);
    setName('');
    setImageUrl('');
    setImagePosX(50);
    setImagePosY(50);
    setZoom(100);
    setError('');
    setIsModalOpen(true);
  };

  const openEditModal = (category: any) => {
    setActiveCategory(category);
    setName(category.name);
    setImageUrl(category.image_url);
    {
      const c = catCrop(category);
      setImagePosX(c.cropX);
      setImagePosY(c.cropY);
      setZoom(c.zoom);
    }
    setError('');
    setIsModalOpen(true);
  };

  const openDeleteModal = (category: any) => {
    setActiveCategory(category);
    setIsDeleteModalOpen(true);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsSubmitting(true);
    setError('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', 'categories');

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to upload image');
      }

      setImageUrl(data.url);
    } catch (err: any) {
      setError(err.message || 'Error uploading file');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const payload = {
        name,
        image_url: imageUrl,
        image_pos_x: `${Math.round(imagePosX)}`,
        image_pos_y: `${Math.round(imagePosY)}`,
        image_zoom: Math.round(zoom) // percent
      };

      if (activeCategory) {
        // Edit
        const { data, error: updateError } = await supabase
          .from('categories')
          .update(payload)
          .eq('id', activeCategory.id)
          .select()
          .single();

        if (updateError) throw updateError;
        setCategories(categories.map(c => c.id === activeCategory.id ? data : c));

        // Log activity
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('activity_logs').insert({
          user_id: user?.id,
          type: 'Category Updated',
          description: `Admin updated category "${name}"`
        });
      } else {
        // Add
        const { data, error: insertError } = await supabase
          .from('categories')
          .insert(payload)
          .select()
          .single();

        if (insertError) throw insertError;
        setCategories([...categories, data]);

        // Log activity
        const { data: { user } } = await supabase.auth.getUser();
        await supabase.from('activity_logs').insert({
          user_id: user?.id,
          type: 'Category Added',
          description: `Admin added category "${name}"`
        });
      }
      setIsModalOpen(false);
      showToast(activeCategory ? 'Category updated successfully!' : 'Category added successfully!');
      await revalidateStorefront('categories');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to save category');
      showToast(err.message || 'Failed to save category', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!activeCategory) return;
    setIsSubmitting(true);
    try {
      const { error: deleteError } = await supabase
        .from('categories')
        .delete()
        .eq('id', activeCategory.id);

      if (deleteError) throw deleteError;
      setCategories(categories.filter(c => c.id !== activeCategory.id));
      
      // Log activity
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from('activity_logs').insert({
        user_id: user?.id,
        type: 'Category Deleted',
        description: `Admin deleted category "${activeCategory.name}"`
      });

      setIsDeleteModalOpen(false);
      showToast('Category deleted successfully!');
      await revalidateStorefront('categories');
      router.refresh();
    } catch (err: any) {
      console.error(err);
      showToast('Failed to delete category', true);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Toast show={toast.show} message={toast.message} error={toast.error} />

      {/* Page Header Section */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6 lg:gap-0 mb-6 border-b border-[#d6c3b3]/30 pb-6">
        <div>
          <h1 className="font-jost text-2xl lg:text-3xl text-[#2C3829] mb-2 font-bold">Categories</h1>
          <p className="font-body-md lg:font-body-lg text-[#2C3829]/70">
            Manage the organizational structure of your collections.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center w-full lg:w-auto">
          <Button onClick={openAddModal} variant="auth-primary" className="w-full sm:!w-auto !py-3.5 !text-sm px-6 whitespace-nowrap flex items-center justify-center">
            Add Category
          </Button>
        </div>
      </div>

      {/* Category Grid */}
      {categories.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-6 text-center w-full">
          <div className="w-32 h-32 mb-6 flex items-center justify-center rounded-full bg-[#FAF7F2] border-2 border-dashed border-[#d6c3b3]">
            <MdCategory className="text-[#2C3829] text-6xl" />
          </div>
          <h3 className="font-jost text-3xl text-[#2C3829] mb-2 font-semibold">No categories yet</h3>
          <p className="font-jost text-[#2C3829]/70 mb-8 max-w-sm">
            You haven't created any categories. Create your first category to start organizing your storefront.
          </p>
        </div>
      ) : (
        <section>
          {/* Mobile View: Horizontal Cards */}
          <div className="md:hidden">
            <Card className="!rounded-xl !p-0 border border-[#d6c3b3]/30 overflow-hidden">
              <div className="divide-y divide-[#d6c3b3]/30">
                {paginatedCategories.map((cat) => (
                  <div key={cat.id} className="p-6 flex items-center justify-between gap-4">
                    <div className="flex gap-4 items-center">
                      <div className="relative w-24 aspect-[4/5] shrink-0 rounded-lg overflow-hidden bg-[#FAF7F2] border border-[#d6c3b3]/30">
                        <CropPreview url={cat.image_url} alt={cat.name} {...catCrop(cat)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="font-medium text-[#2C3829] font-body-md line-clamp-2 leading-tight">
                          {cat.name}
                        </h2>
                      </div>
                    </div>
                    {/* Actions Mobile */}
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={(e: React.MouseEvent) => { e.preventDefault(); openEditModal(cat); }}
                        className="w-9 h-9 rounded-full bg-[#2C3829] flex items-center justify-center hover:opacity-90 transition-opacity text-white"
                      >
                        <MdEdit className="text-lg" />
                      </button>
                      <button
                        type="button"
                        onClick={(e: React.MouseEvent) => { e.preventDefault(); openDeleteModal(cat); }}
                        className="w-9 h-9 rounded-full bg-[#2C3829] flex items-center justify-center hover:opacity-90 transition-opacity text-white"
                      >
                        <MdDelete className="text-lg" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Desktop View: Grid */}
          <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {paginatedCategories.map((cat) => (
              <Card key={cat.id} className="bg-white border border-[#d6c3b3]/30 shadow-sm !rounded-[16px] overflow-hidden hover:shadow-lg transition-shadow group flex flex-col">
                {/* Image Section — 4:5 to match the storefront cards & crop preview */}
                <div className="relative w-full aspect-[4/5] bg-surface-variant overflow-hidden shrink-0">
                  <CropPreview url={cat.image_url} alt={cat.name} {...catCrop(cat)} />
                </div>

                {/* Content Section (Bottom Half) */}
                <div className="flex justify-between items-center gap-3 p-5 flex-1">
                  <h2 className="font-jost text-xl text-[#2C3829] font-semibold flex-1 min-w-0 break-words leading-snug">{cat.name}</h2>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      variant="auth-primary"
                      onClick={(e: React.MouseEvent) => { e.preventDefault(); openEditModal(cat); }}
                      className="!p-0 !w-9 !h-9 flex items-center justify-center !min-w-[2.25rem] !rounded-full"
                    >
                      <MdEdit className="text-lg" />
                    </Button>
                    <Button
                      variant="auth-primary"
                      onClick={(e: React.MouseEvent) => { e.preventDefault(); openDeleteModal(cat); }}
                      className="!p-0 !w-9 !h-9 flex items-center justify-center !min-w-[2.25rem] !rounded-full"
                    >
                      <MdDelete className="text-lg" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
              <span className="font-label-sm text-[#2C3829]/60 text-center sm:text-left">
                Showing {startIndex + 1} to {Math.min(startIndex + itemsPerPage, categories.length)} of {categories.length} categories
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg border border-[#d6c3b3]/50 text-[#2C3829] hover:bg-[#d6c3b3]/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <MdChevronLeft className="text-xl" />
                </button>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg border border-[#d6c3b3]/50 text-[#2C3829] hover:bg-[#d6c3b3]/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <MdChevronRight className="text-xl" />
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Add/Edit Side Sheet */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[70] flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-[#2C3829]/20 backdrop-blur-sm transition-opacity"
            onClick={() => setIsModalOpen(false)}
          />

          {/* Sheet */}
          <div className="relative w-full md:w-[450px] bg-[#FAF7F2] h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            {/* Sheet Header */}
            <div className="flex items-center justify-between p-6 border-b border-[#d6c3b3]/30 bg-[#FAF7F2] shrink-0">
              <h2 className="font-jost text-2xl text-[#2C3829] font-bold">
                {activeCategory ? 'Edit Category' : 'Add Category'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-[#2C3829]/70 hover:text-[#2C3829] transition-colors p-2 rounded-full hover:bg-black/5"
              >
                <MdClose className="text-xl" />
              </button>
            </div>

            {/* Sheet Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              {error && (
                <div className="bg-error/10 text-error px-4 py-3 rounded-lg mb-6 text-sm">
                  {error}
                </div>
              )}

              <form id="categoryForm" onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <Input
                    label="Category Name"
                    placeholder="e.g. Nightwear"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-jost font-semibold text-[#2C3829] mb-1">Category Image</label>
                  <p className="text-xs font-jost text-[#2C3829]/50 mb-3">Recommended size: <span className="font-semibold text-[#2C3829]/70">1080 × 1350 px</span> — portrait images work best for the category cards.</p>

                  {/* Large File Upload Area */}
                  <label className={`cursor-pointer w-full border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 transition-colors ${isSubmitting ? 'border-[#d6c3b3]/50 bg-transparent' : 'border-[#d6c3b3] hover:bg-white bg-white/50'}`}>
                    <div className="w-12 h-12 rounded-full bg-[#f3e6dc] flex items-center justify-center text-[#2C3829]">
                      <MdAddCircleOutline className="text-2xl" />
                    </div>
                    <div className="text-center">
                      <p className="font-jost font-medium text-[#2C3829]">{isSubmitting ? 'Uploading to Ziea...' : 'Upload Image File'}</p>
                      <p className="text-xs text-[#2C3829]/60 mt-1">PNG, JPG, WEBP (Max 5MB)</p>
                    </div>
                    <input
                      type="file"
                      accept="image/jpeg,image/png"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={isSubmitting}
                    />
                  </label>

                  {/* Direct URL + copy */}
                  <div className="mt-4 flex gap-2">
                    <div className="flex-1">
                      <Input
                        placeholder="Or paste direct image URL"
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        required
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleCopy}
                      disabled={!imageUrl}
                      className="shrink-0 w-12 h-12 flex items-center justify-center bg-white border border-[#d6c3b3]/50 rounded-xl hover:bg-[#f3e6dc] text-[#2C3829] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                      title="Copy image URL"
                      aria-label="Copy image URL"
                    >
                      <MdContentCopy className="text-xl" />
                    </button>
                  </div>

                  {imageUrl && (
                    <div className="mt-8 flex flex-col items-center bg-white p-6 rounded-xl border border-[#d6c3b3]/30 shadow-sm">
                      <p className="font-jost font-semibold text-[#2C3829] mb-4 uppercase tracking-widest text-xs">Storefront Preview & Crop</p>

                      <div className="w-44 aspect-[4/5] rounded-2xl overflow-hidden border-2 border-[#d6c3b3] shadow-md relative bg-[#f3e6dc] select-none mb-6">
                        <CropPreview url={imageUrl} alt="Preview" cropX={imagePosX} cropY={imagePosY} zoom={zoom} />
                      </div>

                      <div className="w-full space-y-4 px-2">
                        <div>
                          <div className="flex justify-between text-xs text-[#2C3829]/70 font-jost mb-1">
                            <span>Zoom</span>
                            <span>{Math.round(zoom)}%</span>
                          </div>
                          <input
                            type="range"
                            min="50" max="300" step="5"
                            value={zoom}
                            onChange={(e) => setZoom(Number(e.target.value))}
                            className="w-full accent-[#2C3829]"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-xs text-[#2C3829]/70 font-jost mb-1">
                            <span>Horizontal Pan</span>
                            <span>{Math.round(imagePosX)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0" max="100"
                            value={imagePosX}
                            onChange={(e) => setImagePosX(Number(e.target.value))}
                            className="w-full accent-[#2C3829]"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-xs text-[#2C3829]/70 font-jost mb-1">
                            <span>Vertical Pan</span>
                            <span>{Math.round(imagePosY)}%</span>
                          </div>
                          <input
                            type="range"
                            min="0" max="100"
                            value={imagePosY}
                            onChange={(e) => setImagePosY(Number(e.target.value))}
                            className="w-full accent-[#2C3829]"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </form>
            </div>

            {/* Sheet Footer */}
            <div className="p-6 border-t border-[#d6c3b3]/30 bg-[#FAF7F2] flex justify-end gap-3 shrink-0">
              <Button type="button" variant="auth-social" className="!w-auto !py-3 px-8 text-sm !rounded-full" onClick={() => setIsModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" form="categoryForm" variant="auth-primary" className="!w-auto !py-3 px-8 text-sm !rounded-full" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : 'Save Category'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        title="Delete Category"
        message={`Are you sure you want to delete the "${activeCategory?.name}" category? This action cannot be undone.`}
        confirmLabel="Delete"
        icon={<MdDelete />}
        onConfirm={handleDelete}
        onCancel={() => setIsDeleteModalOpen(false)}
        isLoading={isSubmitting}
      />
    </>
  );
}
