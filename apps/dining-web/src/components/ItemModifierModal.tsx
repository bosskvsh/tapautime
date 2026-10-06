import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CartModifier } from '../stores/useDineInCartStore';
import { supabase } from '../lib/supabase';
import { MenuItem } from './MenuItemCard';

export interface ItemModifierModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: MenuItem | null;
  onAddToCart: (
    item: MenuItem,
    modifiers: CartModifier[],
    quantity: number,
    specialInstructions?: string
  ) => void;
}

interface ModifierGroup {
  name: string;
  isSingleSelect: boolean;
  options: CartModifier[];
}

function isGroupSingleSelect(groupName: string, options: CartModifier[]): boolean {
  if (options.some((opt) => opt.is_single_select === true)) {
    return true;
  }
  const lower = groupName.toLowerCase().trim();
  const isAddonGroup =
    lower.includes('add-on') ||
    lower.includes('addon') ||
    lower.includes('extra') ||
    lower.includes('topping') ||
    lower.includes('side');

  if (isAddonGroup) {
    return false;
  }

  // Any group with multiple options is a single-select choice (e.g. Hot/Iced, Flavours, Choice of Milk)
  if (options.length > 1) {
    return true;
  }

  return (
    lower.includes('size') ||
    lower.includes('temperature') ||
    lower.includes('ice') ||
    lower.includes('sweet') ||
    lower.includes('sugar') ||
    lower.includes('spic') ||
    lower.includes('pedas') ||
    lower.includes('noodle') ||
    lower.includes('choice') ||
    lower.includes('base') ||
    lower.includes('type') ||
    lower.includes('flavour') ||
    lower.includes('flavor') ||
    lower.includes('milk') ||
    lower.includes('bean') ||
    lower.includes('roast') ||
    lower.includes('option')
  );
}

export const ItemModifierModal: React.FC<ItemModifierModalProps> = ({
  isOpen,
  onClose,
  item,
  onAddToCart,
}) => {
  const [quantity, setQuantity] = useState(1);
  const [selectedModifiers, setSelectedModifiers] = useState<CartModifier[]>([]);
  const [modifiers, setModifiers] = useState<CartModifier[]>([]);
  const [loadingModifiers, setLoadingModifiers] = useState<boolean>(false);
  const [specialInstructions, setSpecialInstructions] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setQuantity(1);
      setSelectedModifiers([]);
      setSpecialInstructions('');
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      setModifiers([]);
      setSelectedModifiers([]);
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, item]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch modifiers from Supabase
  useEffect(() => {
    if (!item?.id || !isOpen) {
      setModifiers([]);
      return;
    }

    let isMounted = true;
    setLoadingModifiers(true);

    const fetchModifiers = async () => {
      try {
        const { data, error } = await supabase
          .from('menu_item_modifiers')
          .select('id, modifier_group, option_name, additional_price, is_single_select')
          .eq('item_id', item.id)
          .eq('is_available', true)
          .order('created_at', { ascending: true });

        if (!isMounted) return;
        setLoadingModifiers(false);

        if (!error && data && data.length > 0) {
          const mapped: CartModifier[] = data.map((m: any) => ({
            id: m.id,
            modifier_group: m.modifier_group || 'Add-ons',
            option_name: m.option_name,
            additional_price: Number(m.additional_price) || 0,
            is_single_select: m.is_single_select,
          }));
          setModifiers(mapped);

          // Preselect defaults for single-select groups
          const groupsMap = new Map<string, CartModifier[]>();
          mapped.forEach((m) => {
            const list = groupsMap.get(m.modifier_group) || [];
            list.push(m);
            groupsMap.set(m.modifier_group, list);
          });

          const initialSelections: CartModifier[] = [];
          groupsMap.forEach((groupOptions, groupName) => {
            const isSingle = isGroupSingleSelect(groupName, groupOptions);

            if (isSingle) {
              const defaultChoice =
                groupOptions.find((opt) => opt.additional_price === 0) || groupOptions[0];
              if (defaultChoice) {
                initialSelections.push(defaultChoice);
              }
            }
          });
          setSelectedModifiers(initialSelections);
        } else {
          setModifiers([]);
          setSelectedModifiers([]);
        }
      } catch (err) {
        if (!isMounted) return;
        setLoadingModifiers(false);
        setModifiers([]);
        setSelectedModifiers([]);
      }
    };

    fetchModifiers();
    return () => {
      isMounted = false;
    };
  }, [isOpen, item?.id]);

  const modifierGroups = useMemo(() => {
    const map = new Map<string, CartModifier[]>();
    modifiers.forEach((mod) => {
      const list = map.get(mod.modifier_group) || [];
      list.push(mod);
      map.set(mod.modifier_group, list);
    });

    return Array.from(map.entries()).map(([name, options]): ModifierGroup => {
      const isSingle = isGroupSingleSelect(name, options);
      
      return {
        name,
        isSingleSelect: isSingle,
        options,
      };
    });
  }, [modifiers]);

  const handleToggleModifier = (group: ModifierGroup, option: CartModifier) => {
    if (group.isSingleSelect) {
      setSelectedModifiers((prev) => [
        ...prev.filter((m) => m.modifier_group !== group.name),
        option,
      ]);
    } else {
      setSelectedModifiers((prev) => {
        const exists = prev.some((m) => m.id === option.id);
        if (exists) {
          return prev.filter((m) => m.id !== option.id);
        } else {
          return [...prev, option];
        }
      });
    }
  };

  const isOptionSelected = (optionId: string): boolean => {
    return selectedModifiers.some((m) => m.id === optionId);
  };

  const unitPrice = useMemo(() => {
    if (!item) return 0;
    const basePrice = Number(item.price) || 0;
    const modifiersCost = selectedModifiers.reduce(
      (sum, m) => sum + (Number(m.additional_price) || 0),
      0
    );
    return basePrice + modifiersCost;
  }, [item, selectedModifiers]);

  const totalPrice = unitPrice * quantity;

  if (!isOpen || !item) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
      />

      {/* Modal Dialog Sheet */}
      <div
        className="relative w-full max-w-md max-h-[85vh] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col z-10 overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-200"
      >
        {/* Header Strip */}
        <div className="p-4 sm:p-5 border-b border-stone-100 flex items-start justify-between bg-stone-50/80 shrink-0">
          <div className="flex-1 pr-4">
            <h2 className="text-lg font-black text-stone-900 leading-snug">
              {item.name}
            </h2>
            {item.description ? (
              <p className="text-xs text-stone-500 mt-0.5 line-clamp-2">
                {item.description}
              </p>
            ) : null}
            <div className="mt-2 text-sm font-black text-brand-orange">
              Base: RM {item.price.toFixed(2)}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-stone-200/70 hover:bg-stone-300/80 text-stone-600 flex items-center justify-center transition-colors cursor-pointer shrink-0"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Modifiers List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6">
          {loadingModifiers && (
            <div className="py-8 text-center text-xs text-stone-400 font-bold">
              Loading options...
            </div>
          )}

          {!loadingModifiers && modifierGroups.map((group) => (
            <div key={group.name} className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-wider text-stone-700">
                  {group.name}
                </h3>
                <span className="text-[10px] font-bold text-stone-400">
                  {group.isSingleSelect ? 'Choose 1' : 'Optional'}
                </span>
              </div>

              <div className="space-y-1.5">
                {group.options.map((option) => {
                  const selected = isOptionSelected(option.id);
                  return (
                    <div
                      key={option.id}
                      onClick={() => handleToggleModifier(group, option)}
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all duration-150 ${
                        selected
                          ? 'border-brand-orange bg-orange-50/70 shadow-xs'
                          : 'border-stone-200 hover:border-stone-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-${group.isSingleSelect ? 'full' : 'md'} border-2 flex items-center justify-center transition-all ${
                            selected
                              ? 'border-brand-orange bg-brand-orange text-white'
                              : 'border-stone-300 bg-white'
                          }`}
                        >
                          {selected && (
                            group.isSingleSelect ? (
                              <div className="w-2 h-2 rounded-full bg-white" />
                            ) : (
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            )
                          )}
                        </div>
                        <span className="text-sm font-bold text-stone-800">
                          {option.option_name}
                        </span>
                      </div>

                      {option.additional_price > 0 && (
                        <span className="text-xs font-extrabold text-stone-500 tabular-nums">
                          +RM {option.additional_price.toFixed(2)}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Special Instructions Input */}
          <div className="space-y-1.5 pt-2">
            <label htmlFor="special-instructions" className="text-xs font-black uppercase tracking-wider text-stone-700 block">
              Special Instructions
            </label>
            <textarea
              id="special-instructions"
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              placeholder="e.g. Less spicy, gravy separate..."
              maxLength={120}
              rows={2}
              className="w-full text-xs font-medium text-stone-800 bg-stone-50 border border-stone-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-brand-orange/20 focus:border-brand-orange resize-none"
            />
          </div>
        </div>

        {/* Footer: Quantity & Add Button */}
        <div className="p-4 sm:p-5 border-t border-stone-200/80 bg-stone-50/90 shrink-0 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-stone-600">
              Quantity
            </span>
            <div className="flex items-center gap-3 bg-white border border-stone-200 rounded-xl p-1 shadow-xs">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-8 h-8 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-black text-sm flex items-center justify-center transition-colors cursor-pointer"
              >
                -
              </button>
              <span className="w-8 text-center text-sm font-black text-stone-900 tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                className="w-8 h-8 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 font-black text-sm flex items-center justify-center transition-colors cursor-pointer"
              >
                +
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              onAddToCart(item, selectedModifiers, quantity, specialInstructions);
              onClose();
            }}
            className="w-full h-12 rounded-xl bg-brand-orange hover:bg-orange-600 active:scale-[0.98] text-white font-black text-sm shadow-md shadow-orange-500/25 transition-all flex items-center justify-between px-5 cursor-pointer"
          >
            <span>Add to Order</span>
            <span className="tabular-nums">RM {totalPrice.toFixed(2)}</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
