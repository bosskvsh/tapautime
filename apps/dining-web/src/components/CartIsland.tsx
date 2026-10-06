import React from 'react';

export interface CartIslandProps {
  totalCount: number;
  totalAmount: number;
  tableNumber?: string | null;
  onClick: () => void;
}

export const CartIsland: React.FC<CartIslandProps> = ({
  totalCount,
  totalAmount,
  tableNumber,
  onClick,
}) => {
  if (totalCount <= 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 p-4 z-40 pointer-events-none">
      <div className="max-w-md mx-auto pointer-events-auto">
        <button
          type="button"
          onClick={onClick}
          className="w-full bg-brand-orange hover:bg-orange-600 active:scale-[0.98] text-white p-4 rounded-2xl font-black shadow-xl shadow-orange-500/25 transition-all flex items-center justify-between group cursor-pointer"
        >
          {/* Left Count & Context */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-black">
              {totalCount}
            </div>
            <div className="text-left">
              <div className="text-sm font-black tracking-tight leading-none">
                Review Order
              </div>
              <div className="text-[11px] text-orange-100 font-bold mt-1">
                Dine-In • Table {tableNumber || '-'}
              </div>
            </div>
          </div>

          {/* Right Price & Arrow */}
          <div className="flex items-center gap-2">
            <span className="text-base font-black tabular-nums tracking-tight">
              RM {totalAmount.toFixed(2)}
            </span>
            <svg
              className="w-5 h-5 transition-transform group-hover:translate-x-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </div>
        </button>
      </div>
    </div>
  );
};
