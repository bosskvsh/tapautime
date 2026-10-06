import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'surface' | 'dark' | 'glass';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  padding = 'md',
  className = '',
  ...props
}) => {
  const baseStyles = 'rounded-2xl transition-all';

  const paddingStyles = {
    none: 'p-0',
    sm: 'p-3',
    md: 'p-4 sm:p-5',
    lg: 'p-6 sm:p-8',
  };

  const variantStyles = {
    default: 'bg-white border border-stone-200/80 shadow-sm text-stone-900',
    surface: 'bg-stone-50 border border-stone-200 text-stone-900',
    dark: 'bg-stone-900 border border-stone-800 text-stone-100 shadow-xl',
    glass: 'bg-white/80 backdrop-blur-md border border-white/20 shadow-lg text-stone-900',
  };

  return (
    <div
      className={`${baseStyles} ${paddingStyles[padding]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
