import React from 'react';

export interface SearchFilterStripProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const SearchFilterStrip: React.FC<SearchFilterStripProps> = ({
  searchQuery,
  onSearchChange,
}) => {
  return (
    <div className="px-4">
      {/* Warm-Tinted Search Bar with Local Food Discovery Focus */}
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-stone-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
              clipRule="evenodd"
            />
          </svg>
        </div>

        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search chicken breast, tempeh, laksa..."
          aria-label="Search food stalls and dishes"
          className="w-full rounded-2xl border border-stone-200/70 bg-stone-100/80 py-3.5 pl-11 pr-10 text-sm font-medium text-stone-900 shadow-2xs outline-none transition-all placeholder:text-stone-400 hover:bg-stone-100/95 focus:border-[#FF6600]/40 focus:bg-white focus:ring-2 focus:ring-[#FF6600]"
        />

        {/* Clear Button */}
        {searchQuery.length > 0 && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Clear search text"
            className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-stone-400 hover:text-stone-600 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};
