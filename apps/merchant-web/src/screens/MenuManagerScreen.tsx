import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus,
  Search,
  X,
  Camera,
  SlidersHorizontal,
  Pencil,
  Soup,
  CheckCircle2,
  XCircle,
  Trash2,
  AlertTriangle,
  RotateCcw,
  Flame,
  Star,
  Clock,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useMerchantMenuStore, MerchantMenuItem } from '../stores/useMerchantMenuStore';
import { useMerchantKDSStore } from '../stores/useMerchantKDSStore';
import { ModifierManagerModal } from '../components/ModifierManagerModal';

export const MenuManagerScreen: React.FC = () => {
  const { items, setItems, addItem, updateItem, removeItem, toggleAvailability } = useMerchantMenuStore();
  const { merchantId } = useMerchantKDSStore();

  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedModifierItem, setSelectedModifierItem] = useState<MerchantMenuItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Add Item Form State
  const [itemName, setItemName] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemCategory, setItemCategory] = useState('');
  const [itemAvailable, setItemAvailable] = useState(true);
  const [itemRequiresPreorder, setItemRequiresPreorder] = useState(false);
  const [itemLeadTimeDays, setItemLeadTimeDays] = useState('1');
  const [itemDailyCapacity, setItemDailyCapacity] = useState('');
  const [itemUnlimitedQty, setItemUnlimitedQty] = useState(true);
  const [itemQuantity, setItemQuantity] = useState('0');
  const [itemImageFile, setItemImageFile] = useState<File | null>(null);
  const [itemImagePreview, setItemImagePreview] = useState<string | null>(null);

  // Edit Item Details Modal State (Name & Price)
  const [editDetailsItem, setEditDetailsItem] = useState<MerchantMenuItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editRequiresPreorder, setEditRequiresPreorder] = useState(false);
  const [editLeadTimeDays, setEditLeadTimeDays] = useState('1');
  const [editDailyCapacity, setEditDailyCapacity] = useState('');
  const [editUnlimitedQty, setEditUnlimitedQty] = useState(true);
  const [editQuantity, setEditQuantity] = useState('0');
  const [isUpdatingDetails, setIsUpdatingDetails] = useState(false);
  const [editDetailsError, setEditDetailsError] = useState<string | null>(null);

  // Existing Item Photo Modal State
  const [photoModalItem, setPhotoModalItem] = useState<MerchantMenuItem | null>(null);
  const [isUploadingItemPhoto, setIsUploadingItemPhoto] = useState(false);
  const [photoUploadError, setPhotoUploadError] = useState<string | null>(null);

  // Delete Menu Item Modal State
  const [itemPendingDelete, setItemPendingDelete] = useState<MerchantMenuItem | null>(null);
  const [isDeletingItem, setIsDeletingItem] = useState(false);
  const [deleteItemError, setDeleteItemError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Best Seller Management State
  const [isBestsellerModalOpen, setIsBestsellerModalOpen] = useState(false);
  const [bestsellerSearchQuery, setBestsellerSearchQuery] = useState('');
  const [bestsellerError, setBestsellerError] = useState<string | null>(null);

  const bestsellerItems = useMemo(
    () => items.filter((item) => Boolean(item.bestseller)),
    [items]
  );

  const handleToggleBestseller = useCallback(async (item: MerchantMenuItem) => {
    const isCurrentlyBestseller = Boolean(item.bestseller);
    if (!isCurrentlyBestseller && bestsellerItems.length >= 6) {
      setBestsellerError('You can select a maximum of 6 best sellers.');
      return;
    }
    setBestsellerError(null);
    const newBestsellerState = !isCurrentlyBestseller;

    // Optimistic store update
    updateItem(item.id, { bestseller: newBestsellerState });

    try {
      const { error } = await supabase
        .from('menu_items')
        .update({ bestseller: newBestsellerState })
        .eq('id', item.id);

      if (error) {
        throw error;
      }
    } catch (err: any) {
      console.error('[MenuManager] Failed to toggle bestseller status:', err);
      // Revert optimistic update
      updateItem(item.id, { bestseller: isCurrentlyBestseller });
      setBestsellerError(err?.message || 'Failed to update best seller status');
    }
  }, [bestsellerItems.length, updateItem]);

  const activeMerchantId = merchantId || localStorage.getItem('tapautime_merchant_id') || '';

  // Fetch live menu items for the merchant
  const fetchMenuItems = useCallback(async () => {
    if (!activeMerchantId) {
      setItems([]);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('menu_items')
        .select('id, name, price, is_available, image_url, category, bestseller, requires_preorder, lead_time_days, daily_capacity, available_quantity')
        .or(`merchant_id.eq.${activeMerchantId},store_id.eq.${activeMerchantId}`)
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) {
        setItems(
          data.map((row: any) => ({
            id: row.id,
            name: row.name,
            price: Number(row.price),
            is_available: Boolean(row.is_available ?? true),
            image_url: row.image_url || null,
            category: row.category || null,
            bestseller: Boolean(row.bestseller),
            requires_preorder: Boolean(row.requires_preorder),
            lead_time_days: Number(row.lead_time_days ?? 0),
            daily_capacity: row.daily_capacity != null ? Number(row.daily_capacity) : null,
            available_quantity: row.available_quantity != null ? Number(row.available_quantity) : null,
          }))
        );
      } else {
        setItems([]);
      }
    } catch (err) {
      console.warn('[MenuManager] Failed to fetch menu items:', err);
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, [activeMerchantId, setItems]);

  useEffect(() => {
    fetchMenuItems();
  }, [fetchMenuItems]);

  // Filtered items based on search query
  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase().trim();
    return items.filter((it) => it.name.toLowerCase().includes(q));
  }, [items, searchQuery]);

  // Handle New Item Submission
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = itemName.trim();
    const parsedPrice = parseFloat(itemPrice);

    if (!trimmedName) {
      setErrorMessage('Please enter an item name.');
      return;
    }
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setErrorMessage('Please enter a valid non-negative price.');
      return;
    }

    setIsSubmitting(true);

    try {
      let uploadedImageUrl: string | null = null;

      if (itemImageFile) {
        const ext = itemImageFile.name.split('.').pop() || 'png';
        const sanitizedName = trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
        const filePath = `items/${activeMerchantId}_${Date.now()}_${sanitizedName}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('merchant-documents')
          .upload(filePath, itemImageFile, { cacheControl: '3600', upsert: true });

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from('merchant-documents')
          .getPublicUrl(filePath);

        uploadedImageUrl = publicUrlData.publicUrl;
      }

      const newMenuItem: {
        merchant_id: string;
        name: string;
        price: number;
        is_available: boolean;
        image_url?: string | null;
        category?: string | null;
        requires_preorder: boolean;
        lead_time_days: number;
        daily_capacity: number | null;
        available_quantity: number | null;
      } = {
        merchant_id: activeMerchantId,
        name: trimmedName,
        price: parsedPrice,
        is_available: itemAvailable,
        category: itemCategory.trim() || null,
        requires_preorder: false,
        lead_time_days: 0,
        daily_capacity: null,
        available_quantity: itemUnlimitedQty ? null : parseInt(itemQuantity, 10) || 0,
      };

      if (uploadedImageUrl) {
        newMenuItem.image_url = uploadedImageUrl;
      }

      const { data, error } = await supabase
        .from('menu_items')
        .insert(newMenuItem)
        .select()
        .single();

      if (error) {
        console.warn('[MenuManager] Supabase insert warning, applying local optimistic state:', error);
      }

      const createdItem: MerchantMenuItem = {
        id: data?.id || `local-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        name: trimmedName,
        price: parsedPrice,
        is_available: itemAvailable,
        image_url: uploadedImageUrl || null,
        category: itemCategory.trim() || null,
        bestseller: false,
        requires_preorder: false,
        lead_time_days: 0,
        daily_capacity: null,
        available_quantity: itemUnlimitedQty ? null : parseInt(itemQuantity, 10) || 0,
      };

      addItem(createdItem);

      setItemName('');
      setItemPrice('');
      setItemCategory('');
      setItemAvailable(true);
      setItemRequiresPreorder(false);
      setItemLeadTimeDays('1');
      setItemDailyCapacity('');
      setItemUnlimitedQty(true);
      setItemQuantity('0');
      setItemImageFile(null);
      if (itemImagePreview) {
        URL.revokeObjectURL(itemImagePreview);
        setItemImagePreview(null);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      console.error('[MenuManager] Error adding menu item:', err);
      setErrorMessage(err.message || 'Failed to add item. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Details Modal
  const openEditDetails = (item: MerchantMenuItem) => {
    setEditDetailsItem(item);
    setEditName(item.name);
    setEditPrice(item.price.toFixed(2));
    setEditCategory(item.category || '');
    setEditRequiresPreorder(item.requires_preorder || false);
    setEditLeadTimeDays((item.lead_time_days || 1).toString());
    setEditDailyCapacity(item.daily_capacity != null ? item.daily_capacity.toString() : '');
    setEditUnlimitedQty(item.available_quantity == null);
    setEditQuantity(item.available_quantity != null ? item.available_quantity.toString() : '0');
    setEditDetailsError(null);
  };

  // Handle Edit Details Save
  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDetailsItem) return;

    const trimmed = editName.trim();
    const parsed = parseFloat(editPrice);
    const trimmedCategory = editCategory.trim() || null;

    if (!trimmed) {
      setEditDetailsError('Item name cannot be empty.');
      return;
    }
    if (isNaN(parsed) || parsed < 0) {
      setEditDetailsError('Please enter a valid price.');
      return;
    }

    setIsUpdatingDetails(true);
    setEditDetailsError(null);

    try {
      const { error } = await supabase
        .from('menu_items')
        .update({ 
          name: trimmed, 
          price: parsed, 
          category: trimmedCategory,
          requires_preorder: false,
          lead_time_days: 0,
          daily_capacity: null,
          available_quantity: editUnlimitedQty ? null : parseInt(editQuantity, 10) || 0,
        })
        .eq('id', editDetailsItem.id);

      if (error) throw error;

      updateItem(editDetailsItem.id, { 
        name: trimmed, 
        price: parsed, 
        category: trimmedCategory,
        requires_preorder: false,
        lead_time_days: 0,
        daily_capacity: null,
        available_quantity: editUnlimitedQty ? null : parseInt(editQuantity, 10) || 0,
      });
      setEditDetailsItem(null);
    } catch (err: any) {
      console.error('[MenuManager] Error updating item details:', err);
      setEditDetailsError(err.message || 'Failed to update item details.');
    } finally {
      setIsUpdatingDetails(false);
    }
  };

  // Upload or update photo for an existing item
  const handleUpdateItemPhoto = async (targetItem: MerchantMenuItem, file: File) => {
    setPhotoUploadError(null);

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
      setPhotoUploadError('Please select a valid image file (JPG, PNG, WebP).');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhotoUploadError('Image size must be less than 5MB.');
      return;
    }

    setIsUploadingItemPhoto(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const sanitizedName = targetItem.name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
      const filePath = `items/${activeMerchantId}_${targetItem.id}_${Date.now()}_${sanitizedName}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('merchant-documents')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('merchant-documents')
        .getPublicUrl(filePath);

      const newUrl = publicUrlData.publicUrl;

      const { error: dbError } = await supabase
        .from('menu_items')
        .update({ image_url: newUrl })
        .eq('id', targetItem.id);

      if (dbError) throw dbError;

      updateItem(targetItem.id, { image_url: newUrl });
      setPhotoModalItem((prev) => (prev ? { ...prev, image_url: newUrl } : null));
    } catch (err: unknown) {
      console.error('[MenuManager] Error updating item photo:', err);
      const msg = err instanceof Error ? err.message : 'Failed to upload photo.';
      setPhotoUploadError(msg);
    } finally {
      setIsUploadingItemPhoto(false);
    }
  };

  // Remove photo for an existing item
  const handleRemoveItemPhoto = async (targetItem: MerchantMenuItem) => {
    if (!window.confirm(`Remove photo for "${targetItem.name}"?`)) return;

    setIsUploadingItemPhoto(true);
    setPhotoUploadError(null);
    try {
      const { error: dbError } = await supabase
        .from('menu_items')
        .update({ image_url: null })
        .eq('id', targetItem.id);

      if (dbError) throw dbError;

      updateItem(targetItem.id, { image_url: null });
      setPhotoModalItem((prev) => (prev ? { ...prev, image_url: null } : null));
    } catch (err: unknown) {
      console.error('[MenuManager] Error removing item photo:', err);
      const msg = err instanceof Error ? err.message : 'Failed to remove photo.';
      setPhotoUploadError(msg);
    } finally {
      setIsUploadingItemPhoto(false);
    }
  };

  // Toggle item availability in store and persist to Supabase
  const handleToggleAvailability = async (item: MerchantMenuItem) => {
    const nextStatus = !item.is_available;
    toggleAvailability(item.id);

    try {
      const { error } = await supabase
        .from('menu_items')
        .update({ is_available: nextStatus })
        .eq('id', item.id);

      if (error) {
        toggleAvailability(item.id);
        setActionMessage({ type: 'error', text: error.message || 'Failed to update item availability.' });
        return;
      }
    } catch (err) {
      toggleAvailability(item.id);
      const message = err instanceof Error ? err.message : 'Failed to update item availability.';
      setActionMessage({ type: 'error', text: message });
    }
  };

  const openDeleteItemModal = (item: MerchantMenuItem) => {
    setActionMessage(null);
    setDeleteItemError(null);
    setItemPendingDelete(item);
  };

  const closeDeleteItemModal = () => {
    if (isDeletingItem) return;
    setItemPendingDelete(null);
    setDeleteItemError(null);
  };

  const handleConfirmDeleteItem = async () => {
    if (!itemPendingDelete || isDeletingItem) return;

    setIsDeletingItem(true);
    setDeleteItemError(null);

    try {
      const { data, error } = await supabase.rpc('delete_merchant_menu_item', {
        p_item_id: itemPendingDelete.id,
      });

      if (error) throw error;

      const result = data as { name?: string; preserved_order_lines?: number } | null;
      removeItem(itemPendingDelete.id);
      setItemPendingDelete(null);
      setActionMessage({
        type: 'success',
        text: `"${result?.name || itemPendingDelete.name}" was deleted from your menu.`,
      });
    } catch (err: unknown) {
      console.error('[MenuManager] Error deleting menu item:', err);
      const message = err instanceof Error ? err.message : 'Failed to delete this menu item.';
      setDeleteItemError(message);
    } finally {
      setIsDeletingItem(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto pb-24 md:pb-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-stone-800 pb-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Menu & Inventory Manager</h1>
          <p className="text-xs text-stone-400">Manage item pricing, modifiers, photos, and live availability</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-orange-600 hover:bg-orange-500 active:scale-95 transition-all text-white font-black text-xs rounded-xl shadow cursor-pointer flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Item</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-stone-900/80 border border-stone-800 p-3 rounded-2xl">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search items by name..."
            className="w-full pl-10 pr-9 py-2 bg-stone-950 border border-stone-800 rounded-xl text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:border-orange-500 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-white p-1"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-stone-400 px-1 font-mono">
          <span>{filteredItems.length}</span>
          <span className="text-stone-500 font-sans">of</span>
          <span>{items.length}</span>
          <span className="text-stone-500 font-sans">items</span>
        </div>
      </div>

      {actionMessage && (
        <div
          role={actionMessage.type === 'error' ? 'alert' : 'status'}
          className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs font-bold ${
            actionMessage.type === 'error'
              ? 'border-rose-800 bg-rose-950/60 text-rose-200'
              : 'border-emerald-800 bg-emerald-950/60 text-emerald-200'
          }`}
        >
          <span>{actionMessage.text}</span>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            className="rounded-lg p-1 text-current opacity-70 hover:opacity-100"
            aria-label="Dismiss message"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Best Seller Management Container ── */}
      <div className="bg-stone-900 border border-stone-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
              <Flame className="w-5 h-5 fill-amber-500/30" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                  Best Seller
                </h2>
                <span className={`text-[11px] font-black px-2.5 py-0.5 rounded-full border ${
                  bestsellerItems.length >= 2 && bestsellerItems.length <= 6
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                }`}>
                  {bestsellerItems.length}/6 selected
                </span>
              </div>
              <p className="text-xs text-stone-400 mt-0.5">
                {bestsellerItems.length < 2
                  ? 'Pick at least 2 dishes (maximum 6) to feature in your customer storefront best seller section.'
                  : bestsellerItems.length === 6
                  ? 'Maximum 6 best sellers reached. Active on customer storefront.'
                  : `Featured in customer storefront (${bestsellerItems.length} active). You can select up to 6.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              type="button"
              onClick={() => {
                setBestsellerError(null);
                setIsBestsellerModalOpen(true);
              }}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <Star className="w-4 h-4 fill-stone-950" />
              <span>Pick Best Sellers</span>
            </button>
          </div>
        </div>

        {bestsellerError && (
          <div className="p-3 bg-rose-950/40 border border-rose-800/80 rounded-2xl text-xs text-rose-300 flex items-center gap-2 font-bold">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{bestsellerError}</span>
          </div>
        )}

        {/* Selected Best Sellers Grid / Empty State */}
        {bestsellerItems.length === 0 ? (
          <div className="p-6 text-center rounded-2xl bg-stone-950/60 border border-dashed border-stone-800 text-stone-400 space-y-2">
            <p className="text-xs font-semibold">
              No best sellers picked yet. Select 2 to 6 dishes to highlight them at the top of your customer menu.
            </p>
            <button
              type="button"
              onClick={() => setIsBestsellerModalOpen(true)}
              className="text-xs font-bold text-amber-400 hover:text-amber-300 underline cursor-pointer inline-flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Choose from your menu</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {bestsellerItems.map((item) => (
              <div
                key={item.id}
                className="bg-stone-950/80 border border-stone-800 hover:border-stone-700 rounded-2xl p-3 flex items-center justify-between gap-3 group transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-11 h-11 rounded-xl overflow-hidden bg-stone-900 border border-stone-800 shrink-0 flex items-center justify-center">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <Soup className="w-5 h-5 text-stone-600" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{item.name}</p>
                    <p className="text-[11px] font-mono font-bold text-orange-400">
                      RM {item.price.toFixed(2)}
                    </p>
                    <span className="text-[9px] font-semibold text-stone-500">
                      {item.is_available ? 'Available' : 'Sold Out'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleToggleBestseller(item)}
                  className="w-8 h-8 rounded-xl bg-stone-900 hover:bg-rose-950/60 border border-stone-800 hover:border-rose-800 text-stone-400 hover:text-rose-300 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  title="Remove from Best Sellers"
                  aria-label={`Remove ${item.name} from Best Sellers`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Desktop Table View (>= 768px) */}
      <div className="hidden md:block bg-stone-900 border border-stone-800 rounded-3xl overflow-hidden shadow-xl">
        <table className="w-full text-left text-sm text-stone-300">
          <thead className="bg-stone-950/60 text-xs font-black uppercase text-stone-400 border-b border-stone-800">
            <tr>
              <th className="p-4">Dish</th>
              <th className="p-4">Price (RM)</th>
              <th className="p-4">Availability</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-800/60">
            {isLoading && items.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-stone-500 font-bold">
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></span>
                    Loading menu items...
                  </span>
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-stone-500 font-bold">
                  No menu items found. Click "+ Add New Item" to create your first dish!
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-stone-500 font-bold">
                  No dishes match "{searchQuery}".
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr key={item.id} className="hover:bg-stone-800/30 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div
                        onClick={() => setPhotoModalItem(item)}
                        className="relative w-12 h-12 rounded-xl overflow-hidden bg-stone-950 border border-stone-800 flex items-center justify-center shrink-0 cursor-pointer group hover:border-orange-500/60 transition-all"
                        title="Click to change dish photo"
                      >
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="w-full h-full object-cover transition-transform group-hover:scale-110"
                          />
                        ) : (
                          <Soup className="w-5 h-5 text-stone-600 group-hover:scale-110 transition-transform" />
                        )}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] text-white font-bold transition-opacity">
                          Edit
                        </div>
                      </div>
                      <div>
                        <div className="font-bold text-white text-sm flex items-center gap-1.5 flex-wrap">
                          <span>{item.name}</span>
                          {item.bestseller && (
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30 inline-flex items-center gap-1">
                              <Flame className="w-3 h-3 fill-amber-500" /> Best Seller
                            </span>
                          )}
                          {item.requires_preorder && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-stone-800/90 text-amber-400/90 border border-amber-500/30 inline-flex items-center gap-1">
                              Pre-order (Paused)
                            </span>
                          )}
                          {item.category && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-stone-800 text-orange-400 border border-stone-700/60 inline-flex items-center">
                              {item.category}
                            </span>
                          )}
                          <button
                            onClick={() => openEditDetails(item)}
                            className="text-stone-500 hover:text-white p-0.5 rounded transition-colors"
                            title="Edit dish name & price"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="text-[10px] text-stone-500 flex flex-col gap-0.5 mt-0.5">
                          <span className={`font-medium ${item.available_quantity === 0 ? 'text-rose-400' : 'text-stone-400'}`}>
                            {item.available_quantity === null 
                              ? 'Stock: Unlimited' 
                              : `Stock: ${item.available_quantity} left`}
                          </span>
                          {item.image_url ? (
                            <span className="text-emerald-400 font-semibold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Photo active
                            </span>
                          ) : (
                            <span className="text-stone-500 flex items-center gap-1">
                              <Camera className="w-3 h-3 text-stone-600" /> No photo
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 font-mono font-bold text-stone-200">
                    RM {item.price.toFixed(2)}
                  </td>
                  <td className="p-4">
                    <button
                      onClick={() => handleToggleAvailability(item)}
                      className={`min-h-[32px] text-xs font-bold px-3 py-1 rounded-full border transition-all cursor-pointer inline-flex items-center gap-1.5 ${
                        item.is_available
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-400 border-rose-500/30 hover:bg-rose-500/30'
                      }`}
                    >
                      {item.is_available ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Available
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5" /> Sold Out
                        </>
                      )}
                    </button>
                  </td>
                  <td className="p-4 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleToggleBestseller(item)}
                        disabled={!item.bestseller && bestsellerItems.length >= 6}
                        className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-colors inline-flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                          item.bestseller
                            ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 hover:bg-amber-500/30'
                            : 'bg-stone-800 hover:bg-stone-700 border-stone-700 text-stone-300 hover:text-white'
                        }`}
                        title={
                          item.bestseller
                            ? 'Remove from Best Sellers'
                            : bestsellerItems.length >= 6
                            ? 'Max 6 best sellers reached'
                            : 'Mark as Best Seller'
                        }
                      >
                        <Star className={`w-3.5 h-3.5 ${item.bestseller ? 'fill-amber-400 text-amber-400' : ''}`} />
                        <span>{item.bestseller ? 'Featured' : 'Star'}</span>
                      </button>
                      <button
                        onClick={() => openEditDetails(item)}
                        className="text-xs font-bold text-stone-300 hover:text-white bg-stone-800 hover:bg-stone-700 px-2.5 py-1.5 rounded-lg border border-stone-700 cursor-pointer transition-colors inline-flex items-center gap-1"
                        title="Edit name and price"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Edit</span>
                      </button>
                      <button
                        onClick={() => setPhotoModalItem(item)}
                        className="text-xs font-bold text-stone-300 hover:text-white bg-stone-800 hover:bg-stone-700 px-2.5 py-1.5 rounded-lg border border-stone-700 cursor-pointer transition-colors inline-flex items-center gap-1"
                        title="Upload or change dish photo"
                      >
                        <Camera className="w-3.5 h-3.5" />
                        <span>Photo</span>
                      </button>
                      <button
                        onClick={() => setSelectedModifierItem(item)}
                        className="text-xs font-bold text-stone-300 hover:text-white bg-stone-800 hover:bg-stone-700 px-2.5 py-1.5 rounded-lg border border-stone-700 cursor-pointer transition-colors inline-flex items-center gap-1"
                        title="Manage modifiers and add-ons for this item"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        <span>Modifiers</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => openDeleteItemModal(item)}
                        className="text-xs font-bold text-rose-300 hover:text-rose-200 bg-rose-950/40 hover:bg-rose-900/70 px-2.5 py-1.5 rounded-lg border border-rose-900/70 cursor-pointer transition-colors inline-flex items-center gap-1"
                        title="Delete this item from the menu"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Card Grid View (< 768px) */}
      <div className="md:hidden space-y-3">
        {isLoading && items.length === 0 ? (
          <div className="p-8 text-center text-stone-500 font-bold bg-stone-900 border border-stone-800 rounded-2xl">
            <span className="inline-flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></span>
              Loading menu items...
            </span>
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-stone-500 font-bold bg-stone-900 border border-stone-800 rounded-2xl">
            No menu items found. Click "+ Add New Item" to create your first dish!
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-8 text-center text-stone-500 font-bold bg-stone-900 border border-stone-800 rounded-2xl">
            No dishes match "{searchQuery}".
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredItems.map((item) => (
              <div
                key={item.id}
                className="bg-stone-900 border border-stone-800 rounded-2xl p-4 space-y-3.5 shadow-lg"
              >
                {/* Header Row: Thumbnail, Name, Price */}
                <div className="flex items-start gap-3">
                  <div
                    onClick={() => setPhotoModalItem(item)}
                    className="relative w-14 h-14 rounded-xl overflow-hidden bg-stone-950 border border-stone-800 flex items-center justify-center shrink-0 cursor-pointer group"
                    title="Click to change photo"
                  >
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                    ) : (
                      <Soup className="w-6 h-6 text-stone-600" />
                    )}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[9px] text-white font-bold">
                      Photo
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="text-sm font-bold text-white truncate">{item.name}</h3>
                      {item.bestseller && (
                        <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 inline-flex items-center gap-0.5">
                          <Flame className="w-2.5 h-2.5 fill-amber-500" /> Best Seller
                        </span>
                      )}
                      {item.requires_preorder && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-stone-800/90 text-amber-400/90 border border-amber-500/30 inline-flex items-center">
                          Pre-order (Paused)
                        </span>
                      )}
                      {item.category && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-stone-800 text-orange-400 border border-stone-700/60">
                          {item.category}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-mono font-black text-orange-400 mt-0.5">
                      RM {item.price.toFixed(2)}
                    </p>
                    <p className={`text-[10px] font-medium mt-0.5 ${item.available_quantity === 0 ? 'text-rose-400' : 'text-stone-400'}`}>
                      {item.available_quantity === null 
                        ? 'Stock: Unlimited' 
                        : `Stock: ${item.available_quantity} left`}
                    </p>
                    <p className="text-[10px] text-stone-500 mt-0.5">
                      {item.image_url ? 'Custom photo attached' : 'No photo uploaded'}
                    </p>
                  </div>
                </div>

                {/* Status Toggle Row */}
                <div className="flex items-center justify-between pt-1 border-t border-stone-800/80">
                  <span className="text-xs text-stone-400 font-semibold">Store Status:</span>
                  <button
                    onClick={() => handleToggleAvailability(item)}
                    className={`min-h-[44px] min-w-[120px] px-3 py-1.5 rounded-xl text-xs font-black border transition-all cursor-pointer inline-flex items-center justify-center gap-1.5 ${
                      item.is_available
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-400 border-rose-500/40 hover:bg-rose-500/30'
                    }`}
                  >
                    {item.is_available ? (
                      <>
                        <CheckCircle2 className="w-4 h-4" /> Available
                      </>
                    ) : (
                      <>
                        <XCircle className="w-4 h-4" /> Sold Out
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => void handleToggleBestseller(item)}
                    disabled={!item.bestseller && bestsellerItems.length >= 6}
                    className={`min-h-[32px] text-xs font-bold px-3 py-1 rounded-full border transition-all cursor-pointer inline-flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed ${
                      item.bestseller
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                        : 'bg-stone-800 text-stone-400 border-stone-700 hover:text-stone-200'
                    }`}
                  >
                    <Star className={`w-3 h-3 ${item.bestseller ? 'fill-amber-400 text-amber-400' : ''}`} />
                    <span>{item.bestseller ? 'Best Seller' : 'Star'}</span>
                  </button>
                </div>

                {/* Action Buttons: 4 equal touch targets */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-stone-800/80">
                  <button
                    onClick={() => openEditDetails(item)}
                    className="min-h-[44px] py-2 px-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold rounded-xl border border-stone-700 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5 text-stone-400" />
                    <span className="text-[11px]">Edit</span>
                  </button>
                  <button
                    onClick={() => setPhotoModalItem(item)}
                    className="min-h-[44px] py-2 px-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold rounded-xl border border-stone-700 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
                  >
                    <Camera className="w-3.5 h-3.5 text-stone-400" />
                    <span className="text-[11px]">Photo</span>
                  </button>
                  <button
                    onClick={() => setSelectedModifierItem(item)}
                    className="min-h-[44px] py-2 px-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold rounded-xl border border-stone-700 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-stone-400" />
                    <span className="text-[11px]">Modifiers</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openDeleteItemModal(item)}
                    className="min-h-[44px] py-2 px-2 bg-rose-950/40 hover:bg-rose-900/70 text-rose-200 text-xs font-bold rounded-xl border border-rose-900/70 flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span className="text-[11px]">Delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add New Item Modal */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
        >
          <div className="bg-stone-900 border border-stone-800 rounded-3xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between items-center border-b border-stone-800 pb-3">
              <h2 className="text-lg font-black text-white">Add New Menu Item</h2>
              <button
                onClick={() => {
                  setIsModalOpen(false);
                  setErrorMessage(null);
                  setItemImageFile(null);
                  if (itemImagePreview) {
                    URL.revokeObjectURL(itemImagePreview);
                    setItemImagePreview(null);
                  }
                }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMessage && (
              <div className="p-3 bg-rose-950/80 border border-rose-500/40 text-rose-300 text-xs font-bold rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            <form onSubmit={handleAddItem} className="space-y-4">
              {/* Dish Photo Dropzone */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-stone-400 mb-1.5">
                  Dish Photo (Optional)
                </label>
                <div className="border border-dashed border-stone-700 hover:border-orange-500/60 rounded-2xl p-3.5 bg-stone-950/60 transition-colors text-center relative overflow-hidden">
                  {itemImagePreview ? (
                    <div className="flex items-center gap-3.5 text-left">
                      <img
                        src={itemImagePreview}
                        alt="Item Preview"
                        className="w-16 h-16 rounded-xl object-cover border border-stone-700 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white truncate">
                          {itemImageFile?.name}
                        </p>
                        <p className="text-[10px] text-stone-500 mt-0.5">
                          {itemImageFile ? `${(itemImageFile.size / 1024).toFixed(0)} KB` : ''}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setItemImageFile(null);
                            if (itemImagePreview) {
                              URL.revokeObjectURL(itemImagePreview);
                              setItemImagePreview(null);
                            }
                          }}
                          className="mt-1 text-[11px] font-bold text-rose-400 hover:text-rose-300 cursor-pointer inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" /> Remove Photo
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center cursor-pointer py-3">
                      <input
                        type="file"
                        accept="image/png, image/jpeg, image/webp"
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files && e.target.files[0]) {
                            const file = e.target.files[0];
                            if (file.size > 5 * 1024 * 1024) {
                              setErrorMessage('Image file size must be less than 5MB.');
                              return;
                            }
                            setItemImageFile(file);
                            setItemImagePreview(URL.createObjectURL(file));
                          }
                        }}
                      />
                      <Camera className="w-8 h-8 text-stone-500 mb-1" />
                      <p className="text-xs font-bold text-stone-300">Click to upload dish photo</p>
                      <p className="text-[10px] text-stone-500 mt-0.5">JPG, PNG or WebP up to 5MB</p>
                    </label>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-stone-400 mb-1">
                  Item Name *
                </label>
                <input
                  type="text"
                  required
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="e.g. Claypot Chicken Rice"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-bold focus:outline-none focus:border-orange-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-stone-400 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={itemCategory}
                  onChange={(e) => setItemCategory(e.target.value)}
                  placeholder="e.g. Rice, Noodles, Beverages, Mains"
                  list="new-item-category-suggestions"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-bold focus:outline-none focus:border-orange-500"
                />
                <datalist id="new-item-category-suggestions">
                  <option value="Rice" />
                  <option value="Noodles" />
                  <option value="Beverages" />
                  <option value="Mains" />
                  <option value="Sides" />
                  <option value="Snacks" />
                  <option value="Dessert" />
                </datalist>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {['Rice', 'Noodles', 'Beverages', 'Mains', 'Sides', 'Snacks'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setItemCategory(cat)}
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border transition-colors cursor-pointer ${
                        itemCategory.toLowerCase() === cat.toLowerCase()
                          ? 'bg-orange-500/20 text-orange-400 border-orange-500/50'
                          : 'bg-stone-900 text-stone-400 border-stone-800 hover:text-stone-300'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-stone-400 mb-1">
                  Price (RM) *
                </label>
                <input
                  type="number"
                  step="0.10"
                  min="0"
                  required
                  value={itemPrice}
                  onChange={(e) => setItemPrice(e.target.value)}
                  placeholder="e.g. 10.50"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono font-bold focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Inventory Section */}
              <div className="p-3.5 bg-stone-950/60 border border-stone-800 rounded-xl space-y-3">
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-black uppercase tracking-wider text-stone-400">
                    Inventory Status
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="itemUnlimitedQty"
                      checked={itemUnlimitedQty}
                      onChange={(e) => setItemUnlimitedQty(e.target.checked)}
                      className="w-4 h-4 rounded text-orange-600 bg-stone-900 border-stone-700 focus:ring-0 cursor-pointer"
                    />
                    <label htmlFor="itemUnlimitedQty" className="text-[11px] font-bold text-stone-300 cursor-pointer">
                      Unlimited Stock
                    </label>
                  </div>
                </div>
                {!itemUnlimitedQty && (
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-stone-400 mb-1">
                      Available Quantity *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      required={!itemUnlimitedQty}
                      value={itemQuantity}
                      onChange={(e) => setItemQuantity(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                    />
                  </div>
                )}
              </div>

              {/* Pre-order Section - Greyed out with Coming Soon overlay */}
              <div className="relative overflow-hidden p-3.5 bg-stone-950/60 border border-stone-800/80 rounded-xl space-y-3">
                {/* Greyed out base content */}
                <div className="opacity-35 pointer-events-none select-none grayscale space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="itemRequiresPreorder"
                      checked={false}
                      disabled
                      readOnly
                      className="w-4 h-4 rounded text-stone-600 bg-stone-900 border-stone-700 cursor-not-allowed"
                    />
                    <label htmlFor="itemRequiresPreorder" className="text-xs font-bold text-stone-400 cursor-not-allowed flex-1">
                      Tapau Ahead (Requires Pre-order)
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pl-6 pt-1 border-t border-stone-800/40">
                    <div>
                      <span className="block text-[10px] font-black uppercase tracking-wider text-stone-500 mb-1">
                        Notice (Days)
                      </span>
                      <div className="w-full bg-stone-900/60 border border-stone-800 rounded-lg px-2.5 py-1.5 text-xs text-stone-600 font-mono">
                        1
                      </div>
                    </div>
                    <div>
                      <span className="block text-[10px] font-black uppercase tracking-wider text-stone-500 mb-1">
                        Daily Limit
                      </span>
                      <div className="w-full bg-stone-900/60 border border-stone-800 rounded-lg px-2.5 py-1.5 text-xs text-stone-600 font-mono">
                        Unlimited
                      </div>
                    </div>
                  </div>
                </div>

                {/* Coming Soon Overlay */}
                <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-[2px] flex flex-col items-center justify-center p-3 z-10 text-center gap-1.5">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 shadow-md">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-black uppercase tracking-wider">
                      Coming Soon
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-400 font-medium">
                    Tapau Ahead feature is temporarily paused.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="itemAvailable"
                  checked={itemAvailable}
                  onChange={(e) => setItemAvailable(e.target.checked)}
                  className="w-4 h-4 rounded text-orange-600 bg-stone-950 border-stone-700 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="itemAvailable" className="text-xs font-bold text-stone-300 cursor-pointer">
                  Available for ordering immediately
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsModalOpen(false);
                    setErrorMessage(null);
                    setItemImageFile(null);
                    if (itemImagePreview) {
                      URL.revokeObjectURL(itemImagePreview);
                      setItemImagePreview(null);
                    }
                  }}
                  className="min-h-[44px] px-4 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs rounded-xl cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="min-h-[44px] px-5 py-2.5 bg-orange-600 hover:bg-orange-500 active:scale-95 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow cursor-pointer transition-all flex items-center gap-1.5"
                >
                  {isSubmitting ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Item</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Item Details Modal (Name & Price) */}
      {editDetailsItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
        >
          <div className="bg-stone-900 border border-stone-800 rounded-3xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between items-center border-b border-stone-800 pb-3">
              <div>
                <h2 className="text-lg font-black text-white">Edit Item Details</h2>
                <p className="text-xs text-stone-400">Update dish title and customer-facing price</p>
              </div>
              <button
                onClick={() => setEditDetailsItem(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editDetailsError && (
              <div className="p-3 bg-rose-950/80 border border-rose-500/40 text-rose-300 text-xs font-bold rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{editDetailsError}</span>
              </div>
            )}

            <form onSubmit={handleSaveDetails} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-stone-400 mb-1">
                  Dish Name *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-bold focus:outline-none focus:border-orange-500"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-stone-400 mb-1">
                  Category
                </label>
                <input
                  type="text"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  placeholder="e.g. Rice, Noodles, Beverages, Mains"
                  list="edit-item-category-suggestions"
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-bold focus:outline-none focus:border-orange-500"
                />
                <datalist id="edit-item-category-suggestions">
                  <option value="Rice" />
                  <option value="Noodles" />
                  <option value="Beverages" />
                  <option value="Mains" />
                  <option value="Sides" />
                  <option value="Snacks" />
                  <option value="Dessert" />
                </datalist>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {['Rice', 'Noodles', 'Beverages', 'Mains', 'Sides', 'Snacks'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setEditCategory(cat)}
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border transition-colors cursor-pointer ${
                        editCategory.toLowerCase() === cat.toLowerCase()
                          ? 'bg-orange-500/20 text-orange-400 border-orange-500/50'
                          : 'bg-stone-900 text-stone-400 border-stone-800 hover:text-stone-300'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-stone-400 mb-1">
                  Price (RM) *
                </label>
                <input
                  type="number"
                  step="0.10"
                  min="0"
                  required
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  className="w-full bg-stone-950 border border-stone-800 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono font-bold focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Inventory Section */}
              <div className="p-3.5 bg-stone-950/60 border border-stone-800 rounded-xl space-y-3">
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-black uppercase tracking-wider text-stone-400">
                    Inventory Status
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="editUnlimitedQty"
                      checked={editUnlimitedQty}
                      onChange={(e) => setEditUnlimitedQty(e.target.checked)}
                      className="w-4 h-4 rounded text-orange-600 bg-stone-900 border-stone-700 focus:ring-0 cursor-pointer"
                    />
                    <label htmlFor="editUnlimitedQty" className="text-[11px] font-bold text-stone-300 cursor-pointer">
                      Unlimited Stock
                    </label>
                  </div>
                </div>
                {!editUnlimitedQty && (
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-stone-400 mb-1">
                      Available Quantity *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      required={!editUnlimitedQty}
                      value={editQuantity}
                      onChange={(e) => setEditQuantity(e.target.value)}
                      className="w-full bg-stone-900 border border-stone-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-orange-500"
                    />
                  </div>
                )}
              </div>

              {/* Pre-order Section - Greyed out with Coming Soon overlay */}
              <div className="relative overflow-hidden p-3.5 bg-stone-950/60 border border-stone-800/80 rounded-xl space-y-3">
                {/* Greyed out base content */}
                <div className="opacity-35 pointer-events-none select-none grayscale space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="editRequiresPreorder"
                      checked={false}
                      disabled
                      readOnly
                      className="w-4 h-4 rounded text-stone-600 bg-stone-900 border-stone-700 cursor-not-allowed"
                    />
                    <label htmlFor="editRequiresPreorder" className="text-xs font-bold text-stone-400 cursor-not-allowed flex-1">
                      Tapau Ahead (Requires Pre-order)
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3 pl-6 pt-1 border-t border-stone-800/40">
                    <div>
                      <span className="block text-[10px] font-black uppercase tracking-wider text-stone-500 mb-1">
                        Notice (Days)
                      </span>
                      <div className="w-full bg-stone-900/60 border border-stone-800 rounded-lg px-2.5 py-1.5 text-xs text-stone-600 font-mono">
                        1
                      </div>
                    </div>
                    <div>
                      <span className="block text-[10px] font-black uppercase tracking-wider text-stone-500 mb-1">
                        Daily Limit
                      </span>
                      <div className="w-full bg-stone-900/60 border border-stone-800 rounded-lg px-2.5 py-1.5 text-xs text-stone-600 font-mono">
                        Unlimited
                      </div>
                    </div>
                  </div>
                </div>

                {/* Coming Soon Overlay */}
                <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-[2px] flex flex-col items-center justify-center p-3 z-10 text-center gap-1.5">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 shadow-md">
                    <Clock className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-black uppercase tracking-wider">
                      Coming Soon
                    </span>
                  </div>
                  <p className="text-[11px] text-stone-400 font-medium">
                    Tapau Ahead feature is temporarily paused.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-stone-800">
                <button
                  type="button"
                  onClick={() => setEditDetailsItem(null)}
                  className="min-h-[44px] px-4 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs rounded-xl cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingDetails}
                  className="min-h-[44px] px-5 py-2.5 bg-orange-600 hover:bg-orange-500 active:scale-95 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow cursor-pointer transition-all flex items-center gap-1.5"
                >
                  {isUpdatingDetails ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    <span>Save Changes</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Existing Item Photo Management Modal */}
      {photoModalItem && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
        >
          <div className="bg-stone-900 border border-stone-800 rounded-3xl w-full max-w-md p-6 space-y-5 shadow-2xl">
            <div className="flex justify-between items-center border-b border-stone-800 pb-3">
              <div>
                <h2 className="text-lg font-black text-white">Dish Photo</h2>
                <p className="text-xs text-stone-400">
                  {photoModalItem.name} • RM {photoModalItem.price.toFixed(2)}
                </p>
              </div>
              <button
                onClick={() => {
                  setPhotoModalItem(null);
                  setPhotoUploadError(null);
                }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {photoUploadError && (
              <div className="p-3 bg-rose-950/80 border border-rose-500/40 text-rose-300 text-xs font-bold rounded-xl flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{photoUploadError}</span>
              </div>
            )}

            {/* Photo Preview Frame */}
            <div className="relative h-48 rounded-2xl overflow-hidden border border-stone-800 bg-stone-950 flex items-center justify-center group shadow-inner">
              {photoModalItem.image_url ? (
                <img
                  src={photoModalItem.image_url}
                  alt={photoModalItem.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-center p-4">
                  <Soup className="w-12 h-12 text-stone-600 mx-auto mb-2" />
                  <span className="text-xs text-stone-400 font-bold block">No custom photo uploaded yet</span>
                  <p className="text-[11px] text-stone-600 mt-1">Customers currently see the default placeholder icon</p>
                </div>
              )}
            </div>

            {/* Photo Actions */}
            <div className="space-y-3 pt-2">
              <label
                className={`w-full min-h-[44px] py-3 px-4 bg-orange-600 hover:bg-orange-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-lg shadow-orange-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  isUploadingItemPhoto ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                <input
                  type="file"
                  accept="image/png, image/jpeg, image/webp"
                  className="hidden"
                  disabled={isUploadingItemPhoto}
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleUpdateItemPhoto(photoModalItem, e.target.files[0]);
                      e.target.value = '';
                    }
                  }}
                />
                {isUploadingItemPhoto ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Uploading photo...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    <span>{photoModalItem.image_url ? 'Upload New Photo' : 'Select Photo to Upload'}</span>
                  </>
                )}
              </label>

              {photoModalItem.image_url && (
                <button
                  type="button"
                  disabled={isUploadingItemPhoto}
                  onClick={() => handleRemoveItemPhoto(photoModalItem)}
                  className="w-full min-h-[44px] py-2.5 px-4 bg-stone-800 hover:bg-rose-950/80 border border-stone-700 hover:border-rose-800/80 text-stone-300 hover:text-rose-300 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Remove Photo</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Menu Item Confirmation Modal */}
      {itemPendingDelete && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-menu-item-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <div className="w-full max-w-md rounded-3xl border border-rose-900/70 bg-[#141211] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-950/80 text-rose-400">
                  <Trash2 className="h-5 w-5" />
                </span>
                <div>
                  <h2 id="delete-menu-item-title" className="font-black text-white">Delete menu item?</h2>
                  <p className="mt-1 text-xs leading-relaxed text-stone-400">
                    This will remove <span className="font-bold text-stone-200">{itemPendingDelete.name}</span> from your menu.
                    Existing order history will keep its saved item name and price.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDeleteItemModal}
                disabled={isDeletingItem}
                className="rounded-lg p-1 text-stone-500 transition-colors hover:bg-stone-800 hover:text-white disabled:opacity-50"
                aria-label="Close delete confirmation"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {deleteItemError && (
              <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-800 bg-rose-950/60 px-3.5 py-3 text-xs text-rose-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                <span>{deleteItemError}</span>
              </div>
            )}

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDeleteItemModal}
                disabled={isDeletingItem}
                className="min-h-[44px] rounded-xl bg-stone-800 px-4 py-2.5 text-xs font-bold text-stone-300 transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmDeleteItem()}
                disabled={isDeletingItem}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black text-white transition-colors hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeletingItem ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {isDeletingItem ? 'Deleting…' : 'Delete Item'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modifier Manager Modal */}
      <ModifierManagerModal
        item={selectedModifierItem}
        isOpen={Boolean(selectedModifierItem)}
        onClose={() => setSelectedModifierItem(null)}
      />

      {/* Best Seller Dish Picker Modal */}
      {isBestsellerModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="bestseller-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        >
          <div className="bg-stone-900 border border-stone-800 rounded-3xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-5 border-b border-stone-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
                  <Star className="w-5 h-5 fill-amber-500" />
                </div>
                <div>
                  <h3 id="bestseller-modal-title" className="text-base font-black text-white">
                    Pick Best Sellers
                  </h3>
                  <p className="text-xs text-stone-400">
                    Choose 2 to 6 dishes to highlight on your customer storefront
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsBestsellerModalOpen(false);
                  setBestsellerSearchQuery('');
                  setBestsellerError(null);
                }}
                className="w-8 h-8 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Selection Counter & Search */}
            <div className="p-4 bg-stone-950/60 border-b border-stone-800/80 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-300">
                  Selected Dishes:
                </span>
                <span className={`text-xs font-black px-2.5 py-0.5 rounded-full border ${
                  bestsellerItems.length >= 2 && bestsellerItems.length <= 6
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                }`}>
                  {bestsellerItems.length} of 6 (Min 2 required)
                </span>
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
                <input
                  type="text"
                  value={bestsellerSearchQuery}
                  onChange={(e) => setBestsellerSearchQuery(e.target.value)}
                  placeholder="Search your dishes…"
                  className="w-full pl-9 pr-4 py-2 bg-stone-900 border border-stone-800 rounded-xl text-xs text-white placeholder-stone-500 focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              {bestsellerError && (
                <div className="p-2.5 bg-rose-950/40 border border-rose-800/80 rounded-xl text-xs text-rose-300 flex items-center gap-2 font-bold">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span>{bestsellerError}</span>
                </div>
              )}
            </div>

            {/* Dish List */}
            <div className="p-4 overflow-y-auto flex-1 space-y-2 divide-y divide-stone-800/40">
              {items.length === 0 ? (
                <p className="p-8 text-center text-stone-500 text-xs font-bold">
                  No dishes created in menu yet.
                </p>
              ) : items
                  .filter((item) =>
                    item.name.toLowerCase().includes(bestsellerSearchQuery.toLowerCase()) ||
                    (item.category && item.category.toLowerCase().includes(bestsellerSearchQuery.toLowerCase()))
                  )
                  .map((item) => {
                    const isSelected = Boolean(item.bestseller);
                    const isMaxReached = !isSelected && bestsellerItems.length >= 6;

                    return (
                      <div
                        key={`pick-${item.id}`}
                        onClick={() => {
                          if (!isSelected && isMaxReached) return;
                          void handleToggleBestseller(item);
                        }}
                        className={`pt-2 first:pt-0 p-3 rounded-2xl flex items-center justify-between gap-3 transition-colors ${
                          isSelected
                            ? 'bg-amber-500/10 border border-amber-500/30 cursor-pointer'
                            : isMaxReached
                            ? 'opacity-40 bg-stone-950/30 border border-transparent cursor-not-allowed'
                            : 'hover:bg-stone-800/50 border border-transparent cursor-pointer'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 rounded-xl overflow-hidden bg-stone-950 border border-stone-800 shrink-0 flex items-center justify-center">
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                              <Soup className="w-5 h-5 text-stone-600" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-white truncate">{item.name}</span>
                              {item.category && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-stone-800 text-stone-400">
                                  {item.category}
                                </span>
                              )}
                            </div>
                            <span className="text-xs font-mono font-bold text-orange-400">
                              RM {item.price.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        <div className="shrink-0 flex items-center gap-2">
                          <button
                            type="button"
                            disabled={isMaxReached}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                              isSelected
                                ? 'bg-amber-500 text-stone-950 shadow-xs'
                                : isMaxReached
                                ? 'bg-stone-800 text-stone-500 cursor-not-allowed'
                                : 'bg-stone-800 hover:bg-stone-700 text-stone-200'
                            }`}
                          >
                            <Star className={`w-3.5 h-3.5 ${isSelected ? 'fill-stone-950 text-stone-950' : 'text-stone-400'}`} />
                            <span>{isSelected ? 'Selected' : isMaxReached ? 'Max 6' : 'Select'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-stone-800 bg-stone-950 flex items-center justify-between">
              <span className="text-xs text-stone-400">
                {bestsellerItems.length < 2 ? (
                  <span className="text-amber-400 font-bold">
                    Pick at least {2 - bestsellerItems.length} more to activate
                  </span>
                ) : (
                  <span className="text-emerald-400 font-bold">
                    ✓ {bestsellerItems.length} best sellers will display on customer menu
                  </span>
                )}
              </span>

              <button
                type="button"
                onClick={() => {
                  setIsBestsellerModalOpen(false);
                  setBestsellerSearchQuery('');
                  setBestsellerError(null);
                }}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-xs rounded-xl shadow-md transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
