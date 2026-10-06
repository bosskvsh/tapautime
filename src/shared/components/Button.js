import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export const Button = ({ children, variant = 'primary', size = 'md', isLoading = false, leftIcon, rightIcon, className = '', disabled, ...props }) => {
    const baseStyles = 'inline-flex items-center justify-center font-black rounded-2xl transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none cursor-pointer select-none';
    const sizeStyles = {
        sm: 'text-xs px-3 py-1.5 gap-1.5',
        md: 'text-sm px-4 py-2.5 gap-2',
        lg: 'text-base px-6 py-3.5 gap-2.5',
    };
    const variantStyles = {
        primary: 'bg-orange-600 hover:bg-orange-500 text-white shadow-md shadow-orange-600/20 active:shadow-none',
        secondary: 'bg-stone-800 hover:bg-stone-700 text-stone-100 border border-stone-700',
        emerald: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 active:shadow-none',
        amber: 'bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/20 active:shadow-none',
        danger: 'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/20 active:shadow-none',
        outline: 'border-2 border-stone-300 hover:border-stone-400 text-stone-700 bg-transparent',
        ghost: 'text-stone-600 hover:text-stone-900 hover:bg-stone-100 bg-transparent',
    };
    return (_jsxs("button", { className: `${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`, disabled: disabled || isLoading, ...props, children: [isLoading ? (_jsxs("svg", { className: "animate-spin h-4 w-4 text-current", xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8v8H4z" })] })) : (leftIcon), _jsx("span", { children: children }), !isLoading && rightIcon] }));
};
