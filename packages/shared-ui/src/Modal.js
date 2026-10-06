import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from 'react';
export const Modal = ({ isOpen, onClose, title, children, footer, size = 'md', }) => {
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape')
                onClose();
        };
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            window.addEventListener('keydown', handleKeyDown);
        }
        else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen, onClose]);
    if (!isOpen)
        return null;
    const sizeClasses = {
        sm: 'max-w-sm',
        md: 'max-w-md sm:max-w-lg',
        lg: 'max-w-xl sm:max-w-2xl',
        full: 'max-w-full m-2',
    };
    return (_jsxs("div", { className: "fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-fadeIn", children: [_jsx("div", { className: "fixed inset-0", onClick: onClose, "aria-hidden": "true" }), _jsxs("div", { className: `relative w-full ${sizeClasses[size]} bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col max-h-[90vh] z-10`, children: [title && (_jsxs("div", { className: "flex items-center justify-between px-6 py-4 border-b border-stone-100", children: [_jsx("h3", { className: "text-lg font-black text-stone-900 tracking-tight", children: title }), _jsx("button", { onClick: onClose, className: "p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors", "aria-label": "Close modal", children: "\u2715" })] })), _jsx("div", { className: "p-6 overflow-y-auto flex-1", children: children }), footer && (_jsx("div", { className: "px-6 py-4 bg-stone-50 border-t border-stone-100 flex items-center justify-end gap-3", children: footer }))] })] }));
};
