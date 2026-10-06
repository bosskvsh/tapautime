import React from 'react';

export type BadgeVariant = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled' | 'neutral';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md';
  pulse?: boolean;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  pulse = false,
  className = '',
  ...props
}) => {
  const baseStyles = 'inline-flex items-center font-black uppercase tracking-wider rounded-full select-none';

  const sizeStyles = {
    sm: 'text-[10px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
  };

  const variantStyles: Record<BadgeVariant, { bg: string; dot: string }> = {
    pending: { bg: 'bg-amber-100 text-amber-900 border border-amber-300', dot: 'bg-amber-500' },
    preparing: { bg: 'bg-blue-100 text-blue-900 border border-blue-300', dot: 'bg-blue-500' },
    ready: { bg: 'bg-emerald-100 text-emerald-900 border border-emerald-300', dot: 'bg-emerald-500' },
    completed: { bg: 'bg-stone-100 text-stone-700 border border-stone-300', dot: 'bg-stone-400' },
    cancelled: { bg: 'bg-rose-100 text-rose-900 border border-rose-300', dot: 'bg-rose-500' },
    neutral: { bg: 'bg-stone-100 text-stone-800 border border-stone-200', dot: 'bg-stone-400' },
  };

  const style = variantStyles[variant];

  return (
    <span className={`${baseStyles} ${sizeStyles[size]} ${style.bg} ${className}`} {...props}>
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot} ${pulse ? 'animate-ping' : ''}`} />
      <span>{children}</span>
    </span>
  );
};
