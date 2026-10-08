import React, { useState, useMemo } from 'react';
import { MenuItem } from './MenuItemCard';

export interface BundleOffer {
  id: string;
  merchant_id: string;
  bundle_type: 'buy_2_fixed_price' | 'buy_3_fixed_price';
  title: string;
  fixed_price: number;
  applicable_to: 'tapau' | 'dine_in' | 'both';
  item_ids: string[];
  is_active: boolean;
}

export interface BundleSelectionModalProps {
  bundle: BundleOffer | null;
  menuItems: MenuItem[];
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (bundle: BundleOffer, selectedItems: MenuItem[], instructions?: string) => void;
}

export const BundleSelectionModal: React.FC<BundleSelectionModalProps> = ({
  bundle,
  menuItems,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [specialInstructions, setSpecialInstructions] = useState('');

  const requiredCount = bundle?.bundle_type === 'buy_3_fixed_price' ? 3 : 2;

  // Qualifying menu items: if bundle specifies specific items, filter to them; otherwise all available items
  const eligibleItems = useMemo(() => {
    if (!bundle) return [];
    if (bundle.item_ids && bundle.item_ids.length > 0) {
      const eligible = menuItems.filter((item) => bundle.item_ids.includes(item.id) && item.is_available);
      return eligible.length > 0 ? eligible : menuItems.filter((item) => item.is_available);
    }
    return menuItems.filter((item) => item.is_available);
  }, [bundle, menuItems]);

  // Reset state on open/close
  React.useEffect(() => {
    if (isOpen) {
      setSelectedItemIds([]);
      setSpecialInstructions('');
    }
  }, [isOpen, bundle?.id]);

  if (!isOpen || !bundle) return null;

  const currentCount = selectedItemIds.length;
  const isComplete = currentCount === requiredCount;

  const handleToggleItem = (itemId: string) => {
    setSelectedItemIds((prev) => {
      // If already selected, remove one instance of it
      const index = prev.indexOf(itemId);
      if (index > -1) {
        const next = [...prev];
        next.splice(index, 1);
        return next;
      }
      // If reached required count, do not add more
      if (prev.length >= requiredCount) {
        return prev;
      }
      return [...prev, itemId];
    });
  };

  const handleConfirm = () => {
    if (!isComplete) return;
    const selectedDishes = selectedItemIds
      .map((id) => menuItems.find((m) => m.id === id))
      .filter((m): m is MenuItem => Boolean(m));

    onConfirm(bundle, selectedDishes, specialInstructions.trim() || undefined);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-stone-900 animate-in slide-in-from-bottom duration-250"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bundle-modal-title"
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 border-b border-stone-100 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full bg-orange-100 text-brand-orange text-[10px] font-black uppercase tracking-wider">
                {requiredCount === 3 ? 'Trio Combo Deal' : 'Duo Combo Deal'}
              </span>
              <span className="text-xs font-bold text-stone-500">
                Fixed Price Offer
              </span>
            </div>
            <h2 id="bundle-modal-title" className="text-xl font-black text-stone-900 mt-1">
              {bundle.title}
            </h2>
            <p className="text-sm font-black text-brand-orange mt-0.5">
              RM {bundle.fixed_price.toFixed(2)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-500 transition-colors cursor-pointer"
            aria-label="Close bundle selector"
          >
            ✕
          </button>
        </div>

        {/* Step Indicator */}
        <div className="bg-orange-50/80 px-5 py-2.5 border-b border-orange-100 flex items-center justify-between text-xs font-bold text-stone-700">
          <span>Choose any {requiredCount} dishes:</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
            isComplete ? 'bg-emerald-600 text-white' : 'bg-orange-600 text-white'
          }`}>
            {currentCount} of {requiredCount} selected
          </span>
        </div>

        {/* Eligible Items Scrollable List */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2.5 divide-y divide-stone-100">
          {eligibleItems.length === 0 ? (
            <p className="text-sm text-stone-500 text-center py-6">
              No qualifying menu items available for this bundle right now.
            </p>
          ) : (
            eligibleItems.map((item) => {
              const selectedCount = selectedItemIds.filter((id) => id === item.id).length;
              const isSelected = selectedCount > 0;
              return (
                <div
                  key={item.id}
                  className="pt-2.5 first:pt-0 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold text-stone-900 truncate">
                      {item.name}
                    </p>
                    <p className="text-xs text-stone-500">
                      Standard: <span className="line-through">RM {item.price.toFixed(2)}</span> · Included in bundle
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {selectedCount > 0 && (
                      <button
                        type="button"
                        onClick={() => handleToggleItem(item.id)}
                        className="w-8 h-8 rounded-xl bg-stone-100 hover:bg-stone-200 flex items-center justify-center font-bold text-stone-700 active:scale-95 transition-all cursor-pointer"
                      >
                        −
                      </button>
                    )}
                    {selectedCount > 0 && (
                      <span className="w-6 text-center text-sm font-black text-brand-orange font-mono">
                        {selectedCount}
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={!isSelected && currentCount >= requiredCount}
                      onClick={() => handleToggleItem(item.id)}
                      className={`min-h-[36px] px-3.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1 ${
                        isSelected
                          ? 'bg-orange-600 text-white shadow-xs'
                          : currentCount >= requiredCount
                          ? 'bg-stone-100 text-stone-400 cursor-not-allowed opacity-60'
                          : 'bg-stone-900 text-white hover:bg-stone-800 active:scale-95'
                      }`}
                    >
                      {isSelected ? 'Add more' : '+ Select'}
                    </button>
                  </div>
                </div>
              );
            })
          )}

          {/* Special Instructions Note */}
          <div className="pt-4">
            <label htmlFor="bundle-instructions" className="block text-xs font-bold text-stone-600 mb-1">
              Special instructions for combo (optional)
            </label>
            <input
              id="bundle-instructions"
              type="text"
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              placeholder="e.g. Less spicy, separate packaging"
              maxLength={150}
              className="w-full px-3.5 py-2.5 rounded-xl border border-stone-200 text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-orange-500"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-stone-100 bg-stone-50 flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Combo Total</p>
            <p className="text-lg font-black text-stone-900 font-mono">
              RM {bundle.fixed_price.toFixed(2)}
            </p>
          </div>

          <button
            type="button"
            disabled={!isComplete}
            onClick={handleConfirm}
            className={`min-h-[48px] px-6 rounded-2xl font-black text-sm transition-all cursor-pointer shadow-md ${
              isComplete
                ? 'bg-orange-600 hover:bg-orange-500 text-white active:scale-98 shadow-orange-600/30'
                : 'bg-stone-200 text-stone-400 cursor-not-allowed'
            }`}
          >
            {isComplete
              ? `Add Combo to Cart (RM ${bundle.fixed_price.toFixed(2)})`
              : `Select ${requiredCount - currentCount} more`}
          </button>
        </div>
      </div>
    </div>
  );
};
