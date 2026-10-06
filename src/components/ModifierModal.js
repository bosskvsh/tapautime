import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useMemo } from 'react';
import { useCartStore } from '../stores/useCartStore';
export const ModifierModal = ({ item, isOpen, onClose, onAdded, }) => {
    const addItem = useCartStore((state) => state.addItem);
    const [quantity, setQuantity] = useState(1);
    const [specialInstructions, setSpecialInstructions] = useState('');
    const [selectedModifiers, setSelectedModifiers] = useState({});
    // Group modifiers by modifier_group
    const groupedModifiers = useMemo(() => {
        const groups = {};
        (item.modifiers || []).forEach((mod) => {
            if (!groups[mod.modifier_group]) {
                groups[mod.modifier_group] = [];
            }
            groups[mod.modifier_group].push(mod);
        });
        return groups;
    }, [item.modifiers]);
    // Determine if a group is single-select (e.g. Sugar Level, Size) vs multi-select (Add-ons)
    const isSingleSelect = (groupName) => {
        const lower = groupName.toLowerCase();
        return (lower.includes('level') ||
            lower.includes('size') ||
            lower.includes('temp') ||
            lower.includes('variant') ||
            lower.includes('sweet'));
    };
    const handleToggleModifier = (groupName, modifier) => {
        const single = isSingleSelect(groupName);
        const currentList = selectedModifiers[groupName] || [];
        const modifierObj = {
            modifier_id: modifier.id,
            modifier_group: groupName,
            option_name: modifier.option_name,
            additional_price: Number(modifier.additional_price) || 0,
        };
        if (single) {
            // Radio behavior: replace with new selection
            setSelectedModifiers((prev) => ({
                ...prev,
                [groupName]: [modifierObj],
            }));
        }
        else {
            // Checkbox behavior: toggle in array
            const exists = currentList.some((m) => m.modifier_id === modifier.id);
            if (exists) {
                setSelectedModifiers((prev) => ({
                    ...prev,
                    [groupName]: currentList.filter((m) => m.modifier_id !== modifier.id),
                }));
            }
            else {
                setSelectedModifiers((prev) => ({
                    ...prev,
                    [groupName]: [...currentList, modifierObj],
                }));
            }
        }
    };
    // Flatten selected modifiers list
    const allSelectedModifiers = useMemo(() => {
        return Object.values(selectedModifiers).flat();
    }, [selectedModifiers]);
    // Live Unit Price & Total Calculation
    const unitPrice = useMemo(() => {
        const modTotal = allSelectedModifiers.reduce((sum, m) => sum + m.additional_price, 0);
        return Number(item.price) + modTotal;
    }, [item.price, allSelectedModifiers]);
    const totalPrice = useMemo(() => {
        return unitPrice * quantity;
    }, [unitPrice, quantity]);
    if (!isOpen)
        return null;
    const handleAddToCart = () => {
        addItem(item, allSelectedModifiers, quantity, specialInstructions);
        if (onAdded)
            onAdded();
        onClose();
    };
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs transition-opacity animate-fade-in", children: _jsxs("div", { className: "relative w-full max-w-lg max-h-[90vh] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-slide-up", onClick: (e) => e.stopPropagation(), children: [_jsxs("div", { className: "relative p-5 pb-3 border-b border-stone-100 flex items-start justify-between", children: [_jsxs("div", { className: "pr-8", children: [_jsx("h3", { className: "text-xl font-black text-stone-900 leading-tight", children: item.name }), _jsxs("p", { className: "text-sm font-bold text-orange-600 mt-0.5", children: ["RM ", Number(item.price).toFixed(2)] }), item.description && (_jsx("p", { className: "text-xs text-stone-500 mt-1 line-clamp-2", children: item.description }))] }), _jsx("button", { onClick: onClose, className: "p-2 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-600 transition-colors", children: _jsx("svg", { className: "w-5 h-5", fill: "none", stroke: "currentColor", viewBox: "0 0 24 24", children: _jsx("path", { strokeLinecap: "round", strokeLinejoin: "round", strokeWidth: 2, d: "M6 18L18 6M6 6l12 12" }) }) })] }), _jsxs("div", { className: "flex-1 overflow-y-auto p-5 space-y-6", children: [Object.entries(groupedModifiers).map(([groupName, modifiers]) => {
                            const single = isSingleSelect(groupName);
                            const currentSelected = selectedModifiers[groupName] || [];
                            return (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h4", { className: "text-sm font-extrabold text-stone-800 tracking-wide uppercase", children: groupName }), _jsx("span", { className: "text-[11px] font-semibold text-stone-400", children: single ? 'Select 1' : 'Optional / Multi' })] }), _jsx("div", { className: "grid grid-cols-1 gap-2", children: modifiers.map((mod) => {
                                            const isSelected = currentSelected.some((m) => m.modifier_id === mod.id);
                                            const addPrice = Number(mod.additional_price);
                                            return (_jsxs("button", { type: "button", onClick: () => handleToggleModifier(groupName, mod), className: `flex items-center justify-between p-3.5 rounded-2xl border text-left transition-all ${isSelected
                                                    ? 'border-orange-500 bg-orange-50/50 text-orange-950 font-bold shadow-xs'
                                                    : 'border-stone-200 bg-white hover:border-stone-300 text-stone-700'}`, children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("div", { className: `w-5 h-5 rounded-${single ? 'full' : 'md'} border flex items-center justify-center transition-colors ${isSelected
                                                                    ? 'border-orange-500 bg-orange-500 text-white'
                                                                    : 'border-stone-300 bg-white'}`, children: isSelected && (_jsx("svg", { className: "w-3 h-3", fill: "currentColor", viewBox: "0 0 20 20", children: _jsx("path", { fillRule: "evenodd", d: "M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z", clipRule: "evenodd" }) })) }), _jsx("span", { className: "text-sm", children: mod.option_name })] }), addPrice > 0 ? (_jsxs("span", { className: "text-xs font-bold text-stone-600", children: ["+RM ", addPrice.toFixed(2)] })) : (_jsx("span", { className: "text-xs text-stone-400", children: "Free" }))] }, mod.id));
                                        }) })] }, groupName));
                        }), _jsxs("div", { className: "space-y-2 pt-2 border-t border-stone-100", children: [_jsx("label", { className: "block text-xs font-extrabold text-stone-700 uppercase tracking-wide", children: "Special Instructions" }), _jsx("textarea", { value: specialInstructions, onChange: (e) => setSpecialInstructions(e.target.value), placeholder: "e.g. No ice, extra spicy, sauce separated...", rows: 2, className: "w-full p-3 rounded-2xl border border-stone-200 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 text-xs font-medium resize-none" })] })] }), _jsxs("div", { className: "p-4 bg-stone-50 border-t border-stone-100 flex items-center gap-3", children: [_jsxs("div", { className: "flex items-center border border-stone-200 bg-white rounded-2xl p-1 shadow-xs", children: [_jsx("button", { onClick: () => setQuantity((q) => Math.max(1, q - 1)), className: "w-9 h-9 flex items-center justify-center text-stone-600 hover:text-stone-900 active:scale-95 text-lg font-bold", children: "-" }), _jsx("span", { className: "w-8 text-center text-sm font-black text-stone-900", children: quantity }), _jsx("button", { onClick: () => setQuantity((q) => q + 1), className: "w-9 h-9 flex items-center justify-center text-stone-600 hover:text-stone-900 active:scale-95 text-lg font-bold", children: "+" })] }), _jsxs("button", { onClick: handleAddToCart, className: "flex-1 py-3.5 px-4 bg-orange-600 hover:bg-orange-500 active:scale-[0.98] text-white rounded-2xl font-black text-sm shadow-md shadow-orange-600/20 flex items-center justify-between transition-all cursor-pointer", children: [_jsx("span", { children: "Add to Basket" }), _jsxs("span", { children: ["RM ", totalPrice.toFixed(2)] })] })] })] }) }));
};
