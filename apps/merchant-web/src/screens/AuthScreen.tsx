import React, { useState } from 'react';
import { Eye, EyeOff, ArrowRight, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AuthScreenProps {
  onSuccess?: () => void;
  onNavigateToOnboarding?: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onSuccess, onNavigateToOnboarding }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setInfoMsg(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      if (data.session) {
        onSuccess?.();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Sign in failed.';
      setErrorMsg(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1c1917] text-stone-100 flex flex-col justify-center items-center px-4 py-12 selection:bg-orange-600 selection:text-white relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-amber-700/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Auth Card */}
      <div className="w-full max-w-md bg-stone-900 border border-stone-800 rounded-3xl p-8 sm:p-10 shadow-2xl relative z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-orange-600 flex items-center justify-center font-black text-white text-2xl shadow-lg shadow-orange-600/30 mb-4">
            TT
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            TapauTime Merchant
          </h1>
          <p className="text-stone-400 text-xs sm:text-sm mt-1 font-medium">
            Kitchen Display System & Merchant Portal
          </p>
        </div>

        {/* Feedback Alerts */}
        {errorMsg && (
          <div className="mb-5 p-3.5 bg-rose-950/70 border border-rose-800/80 rounded-2xl text-xs text-rose-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}
        {infoMsg && (
          <div className="mb-5 p-3.5 bg-emerald-950/70 border border-emerald-800/80 rounded-2xl text-xs text-emerald-200 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{infoMsg}</span>
          </div>
        )}

        {/* Sign In Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-stone-300 mb-1.5 uppercase tracking-wider">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="boss@tapaustall.my"
              disabled={loading}
              autoComplete="email"
              className="w-full min-h-[44px] bg-stone-950 border border-stone-700 rounded-xl px-4 py-2.5 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-300 mb-1.5 uppercase tracking-wider">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                disabled={loading}
                autoComplete="current-password"
                className="w-full min-h-[44px] bg-stone-950 border border-stone-700 rounded-xl px-4 py-2.5 pr-11 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-white p-1"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[44px] mt-2 py-3 px-4 bg-orange-600 hover:bg-orange-500 active:scale-[0.99] text-white font-black text-sm rounded-xl shadow-lg shadow-orange-600/30 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'Sign In to Stall'
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="relative my-5 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-stone-800" />
          </div>
          <div className="relative bg-stone-900 px-3 text-[10px] font-bold text-stone-500 uppercase tracking-widest">
            New Stall Partner?
          </div>
        </div>

        {/* Secondary Sign Up Action */}
        <button
          type="button"
          onClick={onNavigateToOnboarding}
          className="w-full min-h-[44px] py-3 px-4 bg-stone-950 hover:bg-stone-800 active:scale-[0.99] border border-stone-700 hover:border-orange-500/60 text-stone-200 hover:text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          <span>Sign Up Today via TapauTime Merchant</span>
          <ArrowRight className="w-4 h-4 text-orange-500" />
        </button>

        {/* Session helper hint */}
        <p className="mt-6 text-center text-[11px] text-stone-500 font-medium">
          Use your registered email and password to access your kitchen display system and store controls.
        </p>
      </div>
    </div>
  );
};
