import React, { useState, useEffect, useCallback } from 'react';
import {
  SlidersHorizontal,
  Plus,
  Trash2,
  X,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { MerchantMenuItem } from '../stores/useMerchantMenuStore';

export interface ItemModifier {
  id: string;
  item_id: string;
  modifier_group: string;
  option_name: string;
  additional_price: number;
  is_available: boolean;
  is_single_select: boolean;
}

interface ModifierManagerModalProps {
  item: MerchantMenuItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ModifierManagerModal: React.FC<ModifierManagerModalProps> = ({
  item,
  isOpen,
  onClose,
}) => {
  const [modifiers, setModifiers] = useState<ItemModifier[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [groupName, setGroupName] = useState('Add-ons');
  const [optionName, setOptionName] = useState('');
  const [price, setPrice] = useState('1.00');
  const [isSingleSelect, setIsSingleSelect] = useState(false);

  const fetchModifiers = useCallback(async () => {
    if (!item?.id) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const { data, error } = await supabase
        .from('menu_item_modifiers')
        .select('id, item_id, modifier_group, option_name, additional_price, is_available, is_single_select')
        .eq('item_id', item.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setModifiers(
        (data || []).map((m: any) => ({
          id: m.id,
          item_id: m.item_id,
          modifier_group: m.modifier_group || 'Add-ons',
          option_name: m.option_name,
          additional_price: Number(m.additional_price) || 0,
          is_available: Boolean(m.is_available ?? true),
          is_single_select: Boolean(m.is_single_select ?? false),
        }))
      );
    } catch (err: any) {
      console.warn('[ModifierManager] Failed to fetch modifiers:', err);
      setErrorMessage(err.message || 'Failed to load modifiers');
    } finally {
      setIsLoading(false);
    }
  }, [item?.id]);

  useEffect(() => {
    if (isOpen && item?.id) {
      fetchModifiers();
      setOptionName('');
      setPrice('1.00');
    } else {
      setModifiers([]);
      setErrorMessage(null);
    }
  }, [isOpen, item?.id, fetchModifiers]);

  if (!isOpen || !item) return null;

  const handleAddModifier = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedOption = optionName.trim();
    const parsedPrice = parseFloat(price);

    if (!trimmedOption) {
      setErrorMessage('Option name is required (e.g. Extra Egg).');
      return;
    }
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      setErrorMessage('Price must be a valid non-negative number.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const newMod = {
      item_id: item.id,
      modifier_group: groupName.trim() || 'Add-ons',
      option_name: trimmedOption,
      additional_price: parsedPrice,
      is_available: true,
      is_single_select: isSingleSelect,
    };

    try {
      const { data, error } = await supabase
        .from('menu_item_modifiers')
        .insert(newMod)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        setModifiers((prev) => [
          ...prev,
          {
            id: data.id,
            item_id: data.item_id,
            modifier_group: data.modifier_group,
            option_name: data.option_name,
            additional_price: Number(data.additional_price),
            is_available: data.is_available,
            is_single_select: data.is_single_select,
          },
        ]);
        setOptionName('');
        setPrice('1.00');
      }
    } catch (err: any) {
      console.error('[ModifierManager] Failed to add modifier:', err);
      setErrorMessage(err.message || 'Failed to add modifier.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleAvailability = async (mod: ItemModifier) => {
    const nextStatus = !mod.is_available;
    setModifiers((prev) =>
      prev.map((m) => (m.id === mod.id ? { ...m, is_available: nextStatus } : m))
    );

    try {
      await supabase
        .from('menu_item_modifiers')
        .update({ is_available: nextStatus })
        .eq('id', mod.id);
    } catch (err) {
      console.warn('[ModifierManager] Failed to toggle modifier availability in DB:', err);
    }
  };

  const handleDeleteModifier = async (modId: string) => {
    setModifiers((prev) => prev.filter((m) => m.id !== modId));
    try {
      await supabase.from('menu_item_modifiers').delete().eq('id', modId);
    } catch (err) {
      console.warn('[ModifierManager] Failed to delete modifier:', err);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
    >
      <div className="bg-stone-900 border border-stone-800 rounded-3xl w-full max-w-lg p-6 space-y-5 shadow-2xl">
        {/* Modal Header */}
        <div className="flex justify-between items-start border-b border-stone-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase tracking-wider text-orange-500 flex items-center gap-1">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Modifier Manager</span>
              </span>
              <span className="text-xs font-bold text-stone-500 font-mono">
                • RM {item.price.toFixed(2)}
              </span>
            </div>
            <h2 className="text-xl font-black text-white">{item.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-400 hover:text-white hover:bg-stone-800 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMessage && (
          <div className="p-3 bg-rose-950/80 border border-rose-500/40 text-rose-300 text-xs font-bold rounded-xl flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Existing Modifiers List */}
        <div className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-wider text-stone-400">
            Active Options & Add-ons ({modifiers.length})
          </h3>

          <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
            {isLoading ? (
              <p className="text-xs text-stone-500 font-bold p-4 text-center">Loading modifiers...</p>
            ) : modifiers.length === 0 ? (
              <div className="p-4 rounded-xl bg-stone-950 border border-dashed border-stone-800 text-center">
                <p className="text-xs text-stone-400 font-bold">No modifiers configured for this dish.</p>
                <p className="text-[11px] text-stone-600 mt-0.5">
                  Customers can only order this dish without custom options.
                </p>
              </div>
            ) : (
              modifiers.map((mod) => (
                <div
                  key={mod.id}
                  className="flex items-center justify-between p-3 bg-stone-950 border border-stone-800 rounded-2xl"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="px-2 py-0.5 bg-stone-800 text-stone-300 text-[10px] font-bold rounded-md uppercase">
                      {mod.modifier_group} {mod.is_single_select && '(Choose 1)'}
                    </span>
                    <span className="text-sm font-bold text-white">{mod.option_name}</span>
                    <span className="text-xs font-mono font-bold text-orange-400">
                      +RM {mod.additional_price.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleAvailability(mod)}
                      className={`min-h-[32px] text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer inline-flex items-center gap-1 ${
                        mod.is_available
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-400 border-rose-500/30 hover:bg-rose-500/30'
                      }`}
                    >
                      {mod.is_available ? (
                        <>
                          <CheckCircle2 className="w-3 h-3" /> In Stock
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3 h-3" /> Sold Out
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleDeleteModifier(mod.id)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-stone-500 hover:text-rose-400 hover:bg-rose-950/40 transition-colors cursor-pointer"
                      title="Delete Option"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Add Modifier Form */}
        <form onSubmit={handleAddModifier} className="pt-3 border-t border-stone-800 space-y-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-stone-400 flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" />
            <span>Add Option / Add-on</span>
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-stone-400 mb-1">Group</label>
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Add-ons, Size, Spice"
                className="w-full min-h-[40px] bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-stone-400 mb-1">Option Name *</label>
              <input
                type="text"
                required
                value={optionName}
                onChange={(e) => setOptionName(e.target.value)}
                placeholder="e.g. Extra Sambal"
                className="w-full min-h-[40px] bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-stone-400 mb-1">Price (+RM) *</label>
              <input
                type="number"
                step="0.10"
                min="0"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.50"
                className="w-full min-h-[40px] bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white font-mono font-bold focus:outline-none focus:border-orange-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-stone-400 mb-1">Selection Type</label>
              <select
                value={isSingleSelect ? 'single' : 'multiple'}
                onChange={(e) => setIsSingleSelect(e.target.value === 'single')}
                className="w-full min-h-[40px] bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-xs text-white font-bold focus:outline-none focus:border-orange-500"
              >
                <option value="multiple">Optional (Multiple)</option>
                <option value="single">Required (Choose 1)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-300 font-bold text-xs rounded-xl cursor-pointer transition-colors"
            >
              Done
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-[44px] px-5 py-2 bg-orange-600 hover:bg-orange-500 active:scale-95 disabled:opacity-50 text-white font-black text-xs rounded-xl shadow cursor-pointer transition-all flex items-center gap-1.5"
            >
              {isSubmitting ? 'Saving...' : 'Add Option'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
