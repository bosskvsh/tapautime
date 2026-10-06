import React from 'react';
import { useCartStore } from '../stores/useCartStore';

export interface CartScreenProps {
  onProceedToCheckout?: () => void;
  onBackToMenu?: () => void;
}

export const CartScreen: React.FC<CartScreenProps> = ({ onProceedToCheckout, onBackToMenu }) => {
  const { items, getTotalAmount, removeItem } = useCartStore();
  const totalAmount = getTotalAmount();

  return (
    <div className="p-4 space-y-4 max-w-lg mx-auto pb-28">
      <header className="flex items-center justify-between pb-2 border-b border-stone-200">
        <button onClick={onBackToMenu} className="text-sm font-bold text-stone-500">
          ← Back
        </button>
        <h1 className="text-lg font-black text-stone-900">Your Takeaway Cart</h1>
        <div className="w-10" />
      </header>

      {/* Cart Items List */}
      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="p-8 text-center text-stone-400 bg-white rounded-2xl border border-stone-200">
            Your cart is empty
          </div>
        ) : (
          items.map((item) => (
            <div key={item.cartItemId} className="p-4 bg-white rounded-2xl border border-stone-200 shadow-sm">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-bold text-stone-900">{item.name}</h3>
                  {item.selectedModifiers && item.selectedModifiers.length > 0 && (
                    <p className="text-xs text-stone-500">
                      {item.selectedModifiers.map((m) => m.option_name).join(', ')}
                    </p>
                  )}
                </div>
                <span className="font-black text-stone-900">
                  RM {(item.unitPriceWithModifiers * item.quantity).toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-stone-100">
                <span className="text-xs text-stone-400">Qty: {item.quantity}</span>
                <button
                  onClick={() => removeItem(item.cartItemId)}
                  className="text-xs text-rose-500 font-bold"
                >
                  Remove
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Checkout Button */}
      {items.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 max-w-lg mx-auto">
          <button
            onClick={onProceedToCheckout}
            className="w-full py-4 bg-brand-orange text-white font-black rounded-2xl shadow-xl hover:bg-orange-500 active:scale-98 transition-all"
          >
            Proceed to Checkout • RM {totalAmount.toFixed(2)}
          </button>
        </div>
      )}
    </div>
  );
};
