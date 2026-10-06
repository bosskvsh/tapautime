import React, { useState, useEffect } from 'react';
import { useAdminAuthStore } from '../stores/useAdminAuthStore';
import { supabase } from '../lib/supabase';
import { ShieldAlert, Lock, ArrowRight, Loader2, KeyRound } from 'lucide-react';

interface AdminGuardProps {
  children: React.ReactNode;
}

export const AdminGuard: React.FC<AdminGuardProps> = ({ children }) => {
  const { session, isAdmin, isLoading, adminEmail, initialize, signOut } = useAdminAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    initialize();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      initialize();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [initialize]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setIsSubmitting(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;
      await initialize();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid administrator credentials.';
      setAuthError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1. Initial State Check
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0f0d0c] flex flex-col items-center justify-center text-stone-100 selection:bg-orange-600 selection:text-white p-4">
        <div className="w-16 h-16 rounded-3xl bg-orange-600 flex items-center justify-center font-black text-white text-2xl shadow-xl shadow-orange-600/30 animate-pulse mb-6">
          TT
        </div>
        <p className="text-sm font-bold text-stone-300 tracking-wider uppercase flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
          Verifying Super Admin Privileges...
        </p>
      </div>
    );
  }

  // 2. Authenticated but Lacking Super Admin Role
  if (session && !isAdmin) {
    return (
      <div className="min-h-screen bg-[#0f0d0c] flex flex-col items-center justify-center p-6 text-stone-100 selection:bg-orange-600 selection:text-white relative overflow-hidden">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-red-900/10 rounded-full blur-3xl pointer-events-none" />
        <div className="w-full max-w-md bg-[#181615] border border-red-950/80 rounded-3xl p-8 shadow-2xl relative z-10 text-center">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-red-950/60 border border-red-800/80 flex items-center justify-center text-red-400 mb-5 shadow-lg">
            <ShieldAlert className="w-8 h-8" />
          </div>

          <span className="px-3 py-1 bg-red-950/80 text-red-400 border border-red-800/80 rounded-full text-[10px] font-black uppercase tracking-widest">
            Access Denied
          </span>

          <h1 className="text-2xl font-black text-white mt-3 mb-2 tracking-tight">
            Unauthorized
          </h1>

          <p className="text-xs text-stone-400 leading-relaxed mb-6 font-medium">
            Your account (<span className="text-stone-200 font-bold">{adminEmail || session.user.email}</span>) is not authorized as a TapauTime Super Admin. Platform operations are strictly restricted.
          </p>

          <button
            onClick={() => signOut()}
            className="w-full py-3.5 px-4 bg-[#24201e] hover:bg-stone-800 active:scale-[0.99] border border-stone-700 text-stone-200 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <span>Sign In with Different Account</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // 3. Unauthenticated: Render Super Admin Sign In
  if (!session) {
    return (
      <div className="min-h-screen bg-[#0f0d0c] flex flex-col items-center justify-center p-6 text-stone-100 selection:bg-orange-600 selection:text-white relative overflow-hidden">
        {/* Ambient Backlight */}
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-amber-700/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md bg-[#181615] border border-stone-800 rounded-3xl p-8 sm:p-10 shadow-2xl relative z-10">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="w-14 h-14 rounded-2xl bg-orange-600 flex items-center justify-center font-black text-white text-2xl shadow-lg shadow-orange-600/30 mb-4">
              TT
            </div>
            <span className="px-3 py-1 bg-orange-600/20 text-orange-400 border border-orange-600/30 rounded-full text-[10px] font-black uppercase tracking-widest mb-2 flex items-center gap-1.5">
              <KeyRound className="w-3 h-3" />
              Platform Super Admin
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              TapauTime Command
            </h1>
            <p className="text-stone-400 text-xs mt-1.5 font-medium">
              Administrative credentials required to manage live operations.
            </p>
          </div>

          {authError && (
            <div className="mb-5 p-3.5 bg-red-950/70 border border-red-800/80 rounded-2xl text-xs text-red-200 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-stone-300 mb-1.5 uppercase tracking-wider">
                Admin Work Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="boss@tapautime.my"
                disabled={isSubmitting}
                className="w-full bg-[#12100f] border border-stone-800 rounded-xl px-4 py-3.5 text-sm text-stone-100 placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-300 mb-1.5 uppercase tracking-wider">
                Security Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                disabled={isSubmitting}
                className="w-full bg-[#12100f] border border-stone-800 rounded-xl px-4 py-3.5 text-sm text-stone-100 placeholder-stone-600 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-3.5 px-4 bg-orange-600 hover:bg-orange-500 active:scale-[0.99] text-white font-black text-sm rounded-xl shadow-lg shadow-orange-600/30 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>Unlock Admin Console</span>
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-[11px] text-stone-600 font-bold uppercase tracking-widest">
            Protected by Row Level Security & RBAC
          </p>
        </div>
      </div>
    );
  }

  // 4. Authorized Super Admin
  return <>{children}</>;
};
