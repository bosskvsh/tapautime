import React, { useState } from 'react';
import { Store, AlertTriangle, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useMerchantKDSStore } from '../stores/useMerchantKDSStore';

interface StoreSetupScreenProps {
  userId: string;
  userEmail?: string;
  onSuccess: (merchant: { id: string; business_name: string }) => void;
  onSignOut: () => void;
}

export const StoreSetupScreen: React.FC<StoreSetupScreenProps> = ({
  userId,
  userEmail,
  onSuccess,
  onSignOut,
}) => {
  const [businessName, setBusinessName] = useState('');
  const [stallLocation, setStallLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { setMerchantId, setMerchantName } = useMerchantKDSStore();

  const handleCreateStall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) {
      setErrorMsg('Please enter your stall or business name.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const { data, error } = await supabase
        .from('merchants')
        .insert({
          owner_id: userId,
          business_name: businessName.trim(),
          location: stallLocation.trim() ? { address: stallLocation.trim() } : {},
          is_open: true,
        })
        .select('id, business_name')
        .single();

      if (error) throw error;

      if (data) {
        setMerchantId(data.id);
        setMerchantName(data.business_name);
        localStorage.setItem('tapautime_merchant_id', data.id);
        onSuccess(data);
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to register merchant store.';
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1c1917] text-stone-100 flex flex-col justify-center items-center px-4 py-12 relative selection:bg-orange-600 selection:text-white">
      {/* Ambient background glow */}
      <div className="absolute -top-32 -right-32 w-80 h-80 bg-orange-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-amber-700/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-lg bg-stone-900 border border-stone-800 rounded-3xl p-8 sm:p-10 shadow-2xl relative z-10">
        {/* Onboarding Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-orange-600 flex items-center justify-center text-white shadow-lg shadow-orange-600/30 mb-4">
            <Store className="w-7 h-7" />
          </div>
          <span className="px-3 py-1 bg-orange-600/20 text-orange-400 border border-orange-600/30 rounded-full text-[11px] font-black uppercase tracking-wider mb-2">
            Merchant Onboarding
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Register Your Kitchen Stall
          </h1>
          <p className="text-stone-400 text-xs sm:text-sm mt-1.5 max-w-sm font-medium">
            Welcome to TapauTime! Set up your stall profile to unlock live kitchen ticket display and order dispatching.
          </p>
          {userEmail && (
            <div className="mt-3 text-xs text-stone-500">
              Signed in as <span className="text-stone-300 font-semibold">{userEmail}</span>
            </div>
          )}
        </div>

        {/* Error Notification */}
        {errorMsg && (
          <div className="mb-6 p-3.5 bg-rose-950/70 border border-rose-800/80 rounded-2xl text-xs text-rose-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Setup Form */}
        <form onSubmit={handleCreateStall} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-stone-300 mb-1.5 uppercase tracking-wider">
              Stall / Business Name <span className="text-orange-500">*</span>
            </label>
            <input
              type="text"
              required
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Ah Huat Penang Char Kway Teow"
              disabled={loading}
              className="w-full min-h-[44px] bg-stone-950 border border-stone-700 rounded-xl px-4 py-2.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-300 mb-1.5 uppercase tracking-wider">
              Stall Unit / Location
            </label>
            <input
              type="text"
              value={stallLocation}
              onChange={(e) => setStallLocation(e.target.value)}
              placeholder="e.g. Stall #08, Restoran Megah Utama"
              disabled={loading}
              className="w-full min-h-[44px] bg-stone-950 border border-stone-700 rounded-xl px-4 py-2.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all disabled:opacity-50"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[48px] mt-3 py-3.5 px-4 bg-orange-600 hover:bg-orange-500 active:scale-[0.99] text-white font-black text-sm rounded-xl shadow-lg shadow-orange-600/30 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Launching Kitchen...</span>
              </>
            ) : (
              <>
                <span>Complete Setup & Open KDS</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Sign Out Option */}
        <div className="mt-8 pt-6 border-t border-stone-800/80 flex items-center justify-between text-xs">
          <span className="text-stone-500">Need to switch accounts?</span>
          <button
            type="button"
            onClick={onSignOut}
            className="min-h-[44px] text-stone-400 hover:text-white font-bold transition-colors underline cursor-pointer flex items-center"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};
