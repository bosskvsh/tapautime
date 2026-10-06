import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import { CartModifier, useCartStore } from '../stores/useCartStore';
import { supabase } from '../lib/supabase';

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl?: string;
  badges?: string[];
  is_available?: boolean;
  available_quantity?: number | null;
}

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
  isRequired: boolean;
  options: CartModifier[];
}

/**
 * Zero-dependency inline SVGs to avoid any Material Symbol font ligature leak
 * (e.g. literal "shopping_bag" or "close" raw text display bugs)
 */
const CloseIcon = () => (
  <svg
    className="w-5 h-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const ShoppingBagIcon = () => (
  <svg
    className="w-5 h-5 shrink-0"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
    <path d="M3 6h18" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </svg>
);

const CheckIcon = () => (
  <svg
    className="w-3.5 h-3.5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3.2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const NoteIcon = () => (
  <svg
    className="w-4 h-4 text-stone-500 shrink-0"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

/**
 * Determine if a modifier group is mutually exclusive (single-select radio)
 * based on database configuration, option count, and Kopitiam conventions.
 * 1. If any option is explicitly marked is_single_select === true -> true
 * 2. If the group is explicitly an add-on/extra/topping/side group -> false
 * 3. Any group with multiple options (options.length > 1) -> true (customers choose 1 out of multiple options)
 * 4. Any standard choice group (Size, Temp, Ice, Flavor, Milk, Sugar, Spice, Noodle, Type, etc.) -> true
 */
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

  // Single-select naming indicators
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
  const cartItems = useCartStore((state) => state.items);
  
  const currentCartQuantity = useMemo(() => {
    if (!item?.id) return 0;
    return cartItems.filter(i => i.id === item.id).reduce((sum, i) => sum + i.quantity, 0);
  }, [cartItems, item?.id]);
  
  const maxAddable = item?.available_quantity !== undefined && item?.available_quantity !== null 
    ? Math.max(0, item.available_quantity - currentCartQuantity) 
    : Infinity;

  // Refs for Drag-to-Dismiss gestures
  const modalPanelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const touchStartY = useRef<number>(0);
  const touchStartTime = useRef<number>(0);
  const isDragging = useRef<boolean>(false);

  // Lock body scroll and reset state when opening
  useEffect(() => {
    if (isOpen) {
      setQuantity(1);
      setSelectedModifiers([]);
      setSpecialInstructions('');
      document.body.style.overflow = 'hidden';

      // Reset panel position and transition cleanly
      if (modalPanelRef.current) {
        gsap.killTweensOf(modalPanelRef.current);
        modalPanelRef.current.style.transition = '';
        gsap.set(modalPanelRef.current, { y: 0 });
      }
      if (backdropRef.current) {
        gsap.killTweensOf(backdropRef.current);
        backdropRef.current.style.opacity = '';
      }
    } else {
      document.body.style.overflow = '';
      setModifiers([]);
      setSelectedModifiers([]);
      if (modalPanelRef.current) {
        gsap.killTweensOf(modalPanelRef.current);
      }
      if (backdropRef.current) {
        gsap.killTweensOf(backdropRef.current);
      }
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

  // Fetch live modifiers from Supabase, or use authentic smart fallbacks
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
          initializeDefaultSelections(mapped);
        } else {
          // Strict merchant fidelity: do not inject synthetic templates if merchant configured no modifiers
          setModifiers([]);
          setSelectedModifiers([]);
        }
      } catch (err) {
        if (!isMounted) return;
        console.error('[ItemModifierModal] Failed to fetch modifiers:', err);
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

  // Auto pre-select default option for single-select required groups
  const initializeDefaultSelections = (mods: CartModifier[]) => {
    const groupsMap = new Map<string, CartModifier[]>();
    mods.forEach((m) => {
      const list = groupsMap.get(m.modifier_group) || [];
      list.push(m);
      groupsMap.set(m.modifier_group, list);
    });

    const initialSelections: CartModifier[] = [];
    groupsMap.forEach((groupOptions, groupName) => {
      if (isGroupSingleSelect(groupName, groupOptions)) {
        // Pre-select free option (additional_price === 0) or the first option
        const defaultChoice =
          groupOptions.find((opt) => opt.additional_price === 0) || groupOptions[0];
        if (defaultChoice) {
          initialSelections.push(defaultChoice);
        }
      }
    });

    setSelectedModifiers(initialSelections);
  };

  // Group modifiers by category
  const modifierGroups = useMemo<ModifierGroup[]>(() => {
    const groups: { [name: string]: CartModifier[] } = {};
    modifiers.forEach((mod) => {
      const groupName = mod.modifier_group || 'Customizations';
      if (!groups[groupName]) {
        groups[groupName] = [];
      }
      groups[groupName].push(mod);
    });

    return Object.entries(groups).map(([name, options]) => {
      const isSingle = isGroupSingleSelect(name, options);
      
      return {
        name,
        isSingleSelect: isSingle,
        isRequired: isSingle, // Single select groups (temperature, spice, size) are required
        options,
      };
    });
  }, [modifiers]);

  // Validation state: Identify any required modifier groups that haven't been selected
  const missingRequiredGroups = useMemo(() => {
    return modifierGroups.filter((group) => {
      if (!group.isRequired) return false;
      return !selectedModifiers.some((mod) => mod.modifier_group === group.name);
    });
  }, [modifierGroups, selectedModifiers]);

  const isValid = missingRequiredGroups.length === 0;

  // Toggle or select modifier with single vs multi-select enforcement
  const handleModifierClick = useCallback(
    (mod: CartModifier, isSingle: boolean) => {
      setSelectedModifiers((prev) => {
        if (isSingle) {
          // Remove any previously selected modifier in the same group, then add this one
          const filtered = prev.filter((m) => m.modifier_group !== mod.modifier_group);
          return [...filtered, mod];
        } else {
          // Multi-select toggle
          const exists = prev.some((m) => m.id === mod.id);
          if (exists) {
            return prev.filter((m) => m.id !== mod.id);
          }
          return [...prev, mod];
        }
      });
    },
    []
  );

  // Quick instructions suggestion chips
  const suggestionChips = useMemo(() => {
    if (!item) return [];
    const text = `${item.name} ${item.description || ''}`.toLowerCase();
    const isDrink = /teh|kopi|coffee|tea|mocha|americano|latte|frappe|drink|milo|cham|beverage|matcha/.test(
      text
    );
    if (isDrink) {
      return ['Kurang Manis', 'Tak Mau Manis', 'Separate Ice', 'Extra Hot'];
    }
    return ['Tak Mau Taugeh (No Bean Sprouts)', 'Less Oil', 'Separate Sauce', 'Extra Crispy'];
  }, [item]);

  const handleSuggestionClick = (chipText: string) => {
    setSpecialInstructions((prev) => {
      if (!prev.trim()) return chipText;
      if (prev.includes(chipText)) return prev;
      return `${prev.trim()}, ${chipText}`;
    });
  };

  /**
   * Drag-to-Dismiss Logic with GSAP
   * Scoped to the top grab handle and header area to avoid hijacking inner scrolling.
   */
  const handleDragStart = (clientY: number) => {
    touchStartY.current = clientY;
    touchStartTime.current = Date.now();
    isDragging.current = true;

    if (modalPanelRef.current) {
      gsap.killTweensOf(modalPanelRef.current);
      modalPanelRef.current.style.transition = 'none';
    }
  };

  const handleDragMove = (clientY: number) => {
    if (!isDragging.current || !modalPanelRef.current) return;
    const deltaY = clientY - touchStartY.current;

    if (deltaY > 0) {
      // Downward drag: 1-to-1 tracking
      gsap.set(modalPanelRef.current, { y: deltaY });

      // Ambient backdrop fade
      if (backdropRef.current) {
        const progress = Math.min(1, deltaY / 280);
        backdropRef.current.style.opacity = String(Math.max(0.1, 1 - progress * 0.9));
      }
    } else {
      // Upward drag: subtle rubber-band resistance
      const rubberBand = -Math.pow(Math.abs(deltaY), 0.55) * 2;
      gsap.set(modalPanelRef.current, { y: rubberBand });
    }
  };

  const handleDragEnd = (clientY: number) => {
    if (!isDragging.current || !modalPanelRef.current) return;
    isDragging.current = false;

    const deltaY = clientY - touchStartY.current;
    const deltaTime = Math.max(1, Date.now() - touchStartTime.current);
    const velocity = deltaY / deltaTime; // px per ms

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Dismiss condition: dragged down > 100px OR flicked with velocity > 0.45 px/ms
    if (deltaY > 100 || (velocity > 0.45 && deltaY > 30)) {
      gsap.to(modalPanelRef.current, {
        y: '100%',
        duration: prefersReducedMotion ? 0.15 : 0.24,
        ease: 'power2.in',
        onComplete: () => {
          onClose();
          if (modalPanelRef.current) {
            modalPanelRef.current.style.transition = '';
            gsap.set(modalPanelRef.current, { y: 0 });
          }
          if (backdropRef.current) {
            backdropRef.current.style.opacity = '';
          }
        },
      });

      if (backdropRef.current) {
        gsap.to(backdropRef.current, {
          opacity: 0,
          duration: prefersReducedMotion ? 0.15 : 0.24,
        });
      }
    } else {
      // Snap back with tactile spring
      gsap.to(modalPanelRef.current, {
        y: 0,
        duration: prefersReducedMotion ? 0.2 : 0.38,
        ease: prefersReducedMotion ? 'power1.out' : 'back.out(1.4)',
        onComplete: () => {
          if (modalPanelRef.current) {
            modalPanelRef.current.style.transition = '';
          }
          if (backdropRef.current) {
            backdropRef.current.style.opacity = '';
          }
        },
      });

      if (backdropRef.current) {
        gsap.to(backdropRef.current, {
          opacity: 1,
          duration: 0.2,
        });
      }
    }
  };

  // Touch Event Listeners
  const onTouchStartHandler = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      handleDragStart(e.touches[0].clientY);
    }
  };

  const onTouchMoveHandler = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      handleDragMove(e.touches[0].clientY);
    }
  };

  const onTouchEndHandler = (e: React.TouchEvent) => {
    if (e.changedTouches.length >= 1) {
      handleDragEnd(e.changedTouches[0].clientY);
    }
  };

  // Pointer Event Listeners (for desktop mouse / testing emulation)
  const onPointerDownHandler = (e: React.PointerEvent) => {
    // Only primary button
    if (e.button === 0) {
      handleDragStart(e.clientY);
      (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
    }
  };

  const onPointerMoveHandler = (e: React.PointerEvent) => {
    if (isDragging.current) {
      handleDragMove(e.clientY);
    }
  };

  const onPointerUpHandler = (e: React.PointerEvent) => {
    if (isDragging.current) {
      handleDragEnd(e.clientY);
      try {
        (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
      } catch {
        // Ignored
      }
    }
  };

  if (!item) return null;

  // Pricing calculations
  const unitPrice =
    item.price + selectedModifiers.reduce((sum, mod) => sum + mod.additional_price, 0);
  const totalPrice = unitPrice * quantity;

  const modalContent = (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        onClick={onClose}
        aria-hidden="true"
        className={`fixed inset-0 z-[90] bg-stone-900/60 backdrop-blur-sm transition-opacity duration-300 ease-out ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Bottom Sheet Modal Panel */}
      <div
        ref={modalPanelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-dish-title"
        className={`fixed inset-x-0 bottom-0 z-[100] bg-white rounded-t-[28px] shadow-[0_-16px_48px_rgba(0,0,0,0.25)] max-h-[90dvh] flex flex-col transform transition-transform duration-300 ease-out ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        {/* Top Grab Handle & Header Drag Zone (Touch-Responsive for Drag-to-Dismiss) */}
        <div
          onTouchStart={onTouchStartHandler}
          onTouchMove={onTouchMoveHandler}
          onTouchEnd={onTouchEndHandler}
          onTouchCancel={onTouchEndHandler}
          onPointerDown={onPointerDownHandler}
          onPointerMove={onPointerMoveHandler}
          onPointerUp={onPointerUpHandler}
          onPointerCancel={onPointerUpHandler}
          className="pt-3 pb-2 flex flex-col items-center justify-center shrink-0 cursor-grab active:cursor-grabbing select-none touch-none"
          aria-label="Drag handle to dismiss modal"
        >
          <div className="w-12 h-1.5 bg-stone-300 rounded-full hover:bg-stone-400 active:scale-95 transition-all" />
        </div>

        {/* Modal Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-2 space-y-5">
          {/* Header Section: Drag-enabled header zone */}
          {item.imageUrl ? (
            /* Banner Mode when image exists */
            <div
              onTouchStart={onTouchStartHandler}
              onTouchMove={onTouchMoveHandler}
              onTouchEnd={onTouchEndHandler}
              onTouchCancel={onTouchEndHandler}
              className="relative rounded-2xl overflow-hidden bg-stone-100 border border-stone-200/80 shadow-xs cursor-grab active:cursor-grabbing select-none"
            >
              <div className="relative h-44 sm:h-52 w-full bg-stone-200">
                <img
                  src={item.imageUrl}
                  alt={item.name}
                  className="w-full h-full object-cover"
                  loading="eager"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

                {/* Close Button - Stoppropagation prevents starting a drag */}
                <button
                  onClick={onClose}
                  onTouchStart={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label="Close modal"
                  type="button"
                  className="absolute top-3 right-3 w-9 h-9 bg-black/50 hover:bg-black/70 text-white backdrop-blur-md rounded-full flex items-center justify-center shadow-md active:scale-90 transition-transform"
                >
                  <CloseIcon />
                </button>
              </div>

              <div className="p-4 bg-white flex justify-between items-start gap-4">
                <div>
                  <h2
                    id="modal-dish-title"
                    className="text-xl font-black text-stone-900 leading-snug tracking-tight"
                  >
                    {item.name}
                  </h2>
                  {item.description && (
                    <p className="text-xs text-stone-500 leading-relaxed mt-1 line-clamp-2">
                      {item.description}
                    </p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[11px] font-bold text-stone-400 block uppercase tracking-wider">
                    Base
                  </span>
                  <span className="text-lg font-black text-orange-600 tabular-nums">
                    RM {item.price.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* Space-Efficient Editorial Header Mode */
            <div
              onTouchStart={onTouchStartHandler}
              onTouchMove={onTouchMoveHandler}
              onTouchEnd={onTouchEndHandler}
              onTouchCancel={onTouchEndHandler}
              className="bg-stone-50/80 rounded-2xl p-4 border border-stone-200/80 cursor-grab active:cursor-grabbing select-none"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <h2
                    id="modal-dish-title"
                    className="text-xl font-black text-stone-900 tracking-tight leading-tight"
                  >
                    {item.name}
                  </h2>
                  {item.description && (
                    <p className="text-xs text-stone-500 leading-relaxed mt-1 line-clamp-2">
                      {item.description}
                    </p>
                  )}
                </div>

                {/* Close Button - Stoppropagation prevents starting a drag */}
                <button
                  onClick={onClose}
                  onTouchStart={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  aria-label="Close modal"
                  type="button"
                  className="w-9 h-9 shrink-0 bg-white border border-stone-200/80 hover:bg-stone-100 text-stone-700 rounded-full flex items-center justify-center shadow-xs active:scale-90 transition-transform"
                >
                  <CloseIcon />
                </button>
              </div>

              {/* Base Price Strip */}
              <div className="mt-3 pt-2.5 border-t border-stone-200/60 flex items-center justify-between">
                <span className="text-xs font-bold text-stone-500">Base Item Price</span>
                <span className="text-base font-black text-orange-600 tabular-nums">
                  RM {item.price.toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Modifier Groups Section */}
          {loadingModifiers ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2 text-stone-400">
              <div className="w-6 h-6 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-bold">Loading customizations...</span>
            </div>
          ) : (
            modifierGroups.map((group) => {
              const groupSelections = selectedModifiers.filter(
                (m) => m.modifier_group === group.name
              );
              const selectedCount = groupSelections.length;
              const isFulfilled = selectedCount > 0;

              return (
                <div key={group.name} className="space-y-2.5">
                  {/* Group Header with High-Contrast Status Badge */}
                  <div className="flex items-center justify-between pb-1">
                    <h3 className="font-black text-stone-900 text-sm tracking-tight">
                      {group.name}
                    </h3>
                    <span
                      className={`text-[10px] uppercase px-2.5 py-0.5 rounded-full tracking-wider transition-colors ${
                        group.isRequired && !isFulfilled
                          ? 'bg-amber-500 text-stone-950 font-black shadow-xs'
                          : isFulfilled
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80 font-black'
                          : 'bg-stone-100 text-stone-600 border border-stone-200/60 font-bold'
                      }`}
                    >
                      {group.isRequired
                        ? isFulfilled
                          ? '✓ Selected'
                          : '1 Required'
                        : isFulfilled
                        ? `✓ ${selectedCount} Selected`
                        : 'Optional'}
                    </span>
                  </div>

                {/* Options List with 52px+ Auntie-Proof Touch Targets */}
                <div className="space-y-2">
                  {group.options.map((opt) => {
                    const isSelected = selectedModifiers.some((m) => m.id === opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleModifierClick(opt, group.isSingleSelect)}
                        className={`w-full min-h-[52px] py-3 px-4 rounded-2xl border transition-all duration-150 flex items-center justify-between gap-3 text-left active:scale-[0.98] ${
                          isSelected
                            ? 'border-2 border-orange-500 bg-orange-50/70 shadow-xs'
                            : 'border-stone-200 bg-white hover:border-stone-300 shadow-xs'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Radio / Checkbox Indicator with crisp SVGs */}
                          {group.isSingleSelect ? (
                            <div
                              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${
                                isSelected
                                  ? 'border-orange-600 bg-orange-600'
                                  : 'border-stone-300 bg-white'
                              }`}
                            >
                              {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                            </div>
                          ) : (
                            <div
                              className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors shrink-0 text-white ${
                                isSelected
                                  ? 'border-orange-600 bg-orange-600'
                                  : 'border-stone-300 bg-white'
                              }`}
                            >
                              {isSelected && <CheckIcon />}
                            </div>
                          )}

                          <span
                            className={`text-sm tracking-tight ${
                              isSelected ? 'font-black text-stone-900' : 'font-bold text-stone-700'
                            }`}
                          >
                            {opt.option_name}
                          </span>
                        </div>

                        {/* Additional Price Badge */}
                        <span
                          className={`text-xs tabular-nums shrink-0 ${
                            opt.additional_price > 0
                              ? isSelected
                                ? 'font-black text-orange-700 bg-orange-100/80 px-2 py-0.5 rounded-lg'
                                : 'font-extrabold text-stone-700 bg-stone-100 px-2 py-0.5 rounded-lg'
                              : 'font-semibold text-stone-400'
                          }`}
                        >
                          {opt.additional_price > 0
                            ? `+RM ${opt.additional_price.toFixed(2)}`
                            : 'Free'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

          {/* Special Instructions Section */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center gap-1.5 text-stone-900">
              <NoteIcon />
              <h3 className="font-black text-sm tracking-tight">Special Instructions</h3>
              <span className="text-[11px] text-stone-400 font-bold">(Optional)</span>
            </div>

            {/* Quick Suggestion Chips */}
            {suggestionChips.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {suggestionChips.map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSuggestionClick(chip)}
                    className="text-[11px] font-bold py-1 px-2.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200/80 hover:border-orange-400 active:scale-95 transition-all"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            )}

            <textarea
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              placeholder="e.g. Tak mau taugeh, less spicy, extra hot water..."
              rows={2}
              maxLength={200}
              className="w-full p-3.5 bg-stone-50 border border-stone-200 rounded-2xl text-sm font-medium text-stone-800 placeholder-stone-400 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all resize-none"
            />
          </div>
        </div>

        {/* Sticky High-Contrast Bottom Action Bar (Unsquashable & Rock-Solid) */}
        <div className="p-4 border-t border-stone-200/80 bg-white shrink-0 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] flex items-center gap-3 pb-[max(env(safe-area-inset-bottom),1rem)]">
          {/* Jumbo 44px+ Tactile Stepper */}
          <div className="flex items-center gap-1 bg-stone-100 rounded-2xl p-1 shrink-0 border border-stone-200/60">
            <button
              type="button"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              disabled={quantity <= 1}
              aria-label="Decrease quantity"
              className={`w-11 h-11 flex items-center justify-center rounded-xl bg-white font-black text-xl shadow-xs active:scale-90 transition-transform ${
                quantity <= 1 ? 'text-stone-300 opacity-40 cursor-not-allowed' : 'text-stone-800'
              }`}
            >
              -
            </button>
            <span className="font-black w-8 text-center text-base text-stone-900 tabular-nums select-none">
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity(quantity + 1)}
              disabled={quantity >= maxAddable}
              aria-label="Increase quantity"
              className={`w-11 h-11 flex items-center justify-center rounded-xl font-black text-xl shadow-xs transition-transform ${
                quantity >= maxAddable ? 'bg-stone-100 text-stone-300 cursor-not-allowed opacity-40' : 'bg-white text-stone-800 active:scale-90'
              }`}
            >
              +
            </button>
          </div>

          {/* Sticky High-Contrast "Add to Bag" Action Button */}
          <button
            type="button"
            disabled={!isValid}
            onClick={() => {
              if (!isValid) return;
              onAddToCart(
                item,
                selectedModifiers,
                quantity,
                specialInstructions.trim() || undefined
              );
              onClose();
            }}
            className={`flex-1 h-13 py-3.5 px-4 sm:px-5 rounded-2xl font-black transition-all flex items-center justify-between ${
              isValid
                ? 'bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-600/30 active:scale-[0.98]'
                : 'bg-stone-200 text-stone-400 cursor-not-allowed shadow-none active:scale-100'
            }`}
          >
            {/* Left: Icon + Label */}
            <div className="flex items-center gap-2 shrink-0">
              <ShoppingBagIcon />
              <span className="text-sm sm:text-base font-black tracking-tight whitespace-nowrap">
                {isValid
                  ? 'Add to Bag'
                  : `Select ${missingRequiredGroups[0]?.name || 'Required'}`}
              </span>
            </div>

            {/* Right: Calculated Price */}
            <div
              className={`pl-3 border-l shrink-0 flex items-center ${
                isValid ? 'border-white/25 text-white' : 'border-stone-300 text-stone-400'
              }`}
            >
              <span className="text-sm sm:text-base font-black tabular-nums tracking-tight whitespace-nowrap">
                RM {totalPrice.toFixed(2)}
              </span>
            </div>
          </button>
        </div>
      </div>
    </>
  );

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(modalContent, document.body);
};
