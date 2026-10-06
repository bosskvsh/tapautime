import React from 'react';

export interface CategoryPillsProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
}

export const CategoryPills: React.FC<CategoryPillsProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
}) => {
  return (
    <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-stone-200/80 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
      <div className="max-w-md mx-auto flex overflow-x-auto no-scrollbar gap-2 p-3 items-center px-4">
        {categories.map((category) => {
          const isActive = selectedCategory === category;
          return (
            <button
              key={category}
              type="button"
              onClick={() => onSelectCategory(category)}
              className={`px-4 py-2 rounded-full text-xs font-black whitespace-nowrap transition-all duration-200 cursor-pointer ${
                isActive
                  ? 'bg-stone-900 text-white shadow-md shadow-stone-900/20 scale-105'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200/70 active:scale-95'
              }`}
            >
              {category}
            </button>
          );
        })}
      </div>
    </div>
  );
};
