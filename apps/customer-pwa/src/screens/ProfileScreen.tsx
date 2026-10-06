import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import { useCustomerStore } from '../stores/useCustomerStore';
import { PullToRefresh } from '../components/PullToRefresh';
import { ContactNumberModal } from '../components/auth/ContactNumberModal';

interface OrderSummary {
  id: string;
  display_id: string;
  created_at: string;
  total_amount: number;
  status: string;
  order_status: string;
  payment_status: string;
  pickup_pin: string;
}

export const ProfileScreen: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const signOut = useAuthStore((s) => s.signOut);
  const setUser = useAuthStore((s) => s.setUser);

  // Rewards and loyalty points
  const { pointsBalance, isLoading: isLoadingPoints, fetchPointsBalance } = useCustomerStore();
  const [isEditingPhone, setIsEditingPhone] = useState(false);

  // Profile data states
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  // Inline Auth form states (for unauthenticated users)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authFullName, setAuthFullName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);

  // Fetch past order history, public.users profile, and loyalty points for authenticated user
  const fetchUserData = useCallback(async () => {
    if (!user) return;

    setIsLoadingOrders(true);
    try {
      const [ordersRes, dbUserRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id, display_id, created_at, total_amount, status, order_status, payment_status, pickup_pin')
          .eq('customer_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('users')
          .select('name, phone')
          .eq('id', user.id)
          .maybeSingle(),
        fetchPointsBalance(),
      ]);

      if (!ordersRes.error && ordersRes.data) {
        setOrders(ordersRes.data as OrderSummary[]);
      } else if (ordersRes.error) {
        console.warn('[ProfileScreen] Orders fetch notice:', ordersRes.error);
      }

      // Synchronize phone and name from public.users table into auth store if newer/present
      if (dbUserRes?.data?.phone && dbUserRes.data.phone !== (user.phone || user.user_metadata?.phone)) {
        setUser({
          ...user,
          phone: dbUserRes.data.phone,
          user_metadata: {
            ...user.user_metadata,
            phone: dbUserRes.data.phone,
            ...(dbUserRes.data.name ? { full_name: dbUserRes.data.name } : {}),
          },
        });
      }
    } catch (err) {
      console.error('[ProfileScreen] Error fetching user data:', err);
    } finally {
      setIsLoadingOrders(false);
    }
  }, [user, fetchPointsBalance, setUser]);

  useEffect(() => {
    if (user) {
      fetchUserData();
      fetchPointsBalance();
    }
  }, [user, fetchUserData, fetchPointsBalance]);

  // Google OAuth flow for inline auth
  const handleGoogleSignIn = async () => {
    try {
      setAuthLoading(true);
      setAuthError(null);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('tapau_oauth_return_screen', 'profile');
      }
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + window.location.pathname,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      console.error('[ProfileScreen] Google OAuth error:', err);
      setAuthError(err.message || 'Unable to sign in with Google. Please try again.');
      setAuthLoading(false);
    }
  };

  // Email / Password submission for inline auth
  const handleInlineAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthInfo(null);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!authEmail.trim() || !emailRegex.test(authEmail.trim())) {
      setAuthError('Please enter a valid email address.');
      return;
    }

    if (authPassword.length < 6) {
      setAuthError('Password must be at least 6 characters long.');
      return;
    }

    if (authMode === 'signup' && !authFullName.trim()) {
      setAuthError('Please enter your full name.');
      return;
    }

    setAuthLoading(true);

    try {
      if (authMode === 'signin') {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail.trim(),
          password: authPassword,
        });

        if (error) {
          if (error.message.toLowerCase().includes('invalid login credentials')) {
            throw new Error('Incorrect email or password. Please try again.');
          }
          throw error;
        }

        if (data.user) {
          setUser(data.user);
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
          options: {
            data: {
              full_name: authFullName.trim(),
            },
          },
        });

        if (error) {
          if (error.message.toLowerCase().includes('already registered')) {
            throw new Error('This email is already registered. Please sign in instead.');
          }
          throw error;
        }

        if (data.session && data.user) {
          setUser(data.user);
        } else if (data.user) {
          setAuthInfo('Account created! Logging you in...');
          const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
            email: authEmail.trim(),
            password: authPassword,
          });
          if (!signInErr && signInData.user) {
            setUser(signInData.user);
          }
        }
      }
    } catch (err: any) {
      console.error('[ProfileScreen] Auth error:', err);
      setAuthError(err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setAuthLoading(false);
    }
  };

  // Format account created date
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-MY', {
        month: 'short',
        year: 'numeric',
      })
    : 'Recently';

  const displayName =
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    'Tapau Member';

  return (
    <PullToRefresh
      onRefresh={fetchUserData}
      disabled={!user}
      pullingText="Pull to refresh profile..."
      refreshingText="Updating profile..."
      completeText="Profile updated!"
    >
      <div className="flex flex-col space-y-6 pb-36 bg-brand-offwhite min-h-screen">
        <div className="max-w-lg mx-auto w-full space-y-6 p-4">
          {/* =========================================================================
              1. UNAUTHENTICATED: Inline Authentication Component
              ========================================================================= */}
          {!isInitialized ? (
            <div className="bg-white rounded-[2rem] p-12 shadow-sm border border-stone-100 flex flex-col items-center justify-center space-y-4">
              <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-bold text-stone-500">Checking member session...</p>
            </div>
          ) : !user ? (
            <div className="bg-white rounded-[2rem] p-6 sm:p-8 shadow-sm border border-stone-100 space-y-6 animate-fadeIn">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#f97316]/10 text-[#f97316] flex items-center justify-center mx-auto mb-3 shadow-inner">
                  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <h2 className="text-2xl font-black text-stone-900 tracking-tight">
                  Welcome to TapauTime
                </h2>
                <p className="text-xs text-stone-500 font-semibold mt-1 px-2 leading-relaxed">
                  Sign in or create an account to track your orders, view receipts, and unlock member rewards.
                </p>
              </div>

              {/* Mode Switcher */}
              <div className="flex bg-stone-100 p-1 rounded-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signin');
                    setAuthError(null);
                    setAuthInfo(null);
                  }}
                  className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${
                    authMode === 'signin'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signup');
                    setAuthError(null);
                    setAuthInfo(null);
                  }}
                  className={`flex-1 py-2.5 text-xs font-black rounded-xl transition-all ${
                    authMode === 'signup'
                      ? 'bg-white text-stone-900 shadow-sm'
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  Create Account
                </button>
              </div>

              {/* Error & Info Feedback */}
              {authError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold rounded-2xl flex items-start gap-2.5">
                  <svg className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{authError}</span>
                </div>
              )}

              {authInfo && (
                <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold rounded-2xl flex items-start gap-2.5">
                  <svg className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>{authInfo}</span>
                </div>
              )}

              {/* Google OAuth CTA */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={authLoading}
                className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-white hover:bg-stone-50 text-stone-700 border border-stone-200 rounded-2xl font-bold text-sm shadow-sm transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google</span>
              </button>

              <div className="flex items-center">
                <div className="flex-grow border-t border-stone-200" />
                <span className="px-3 text-[11px] font-bold text-stone-400 uppercase tracking-wider">
                  Or with email
                </span>
                <div className="flex-grow border-t border-stone-200" />
              </div>

              {/* Email / Password Form */}
              <form onSubmit={handleInlineAuthSubmit} className="space-y-4">
                {authMode === 'signup' && (
                  <div>
                    <label className="block text-xs font-bold text-stone-700 mb-1.5">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      value={authFullName}
                      onChange={(e) => setAuthFullName(e.target.value)}
                      placeholder="e.g. Siti Nurhaliza"
                      className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl text-sm font-semibold text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/10 transition-all"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">
                    Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl text-sm font-semibold text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/10 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 mb-1.5">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-2xl text-sm font-semibold text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/10 transition-all"
                  />
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full py-3.5 px-6 bg-[#f97316] hover:bg-orange-600 active:scale-[0.98] text-white font-black text-sm rounded-2xl shadow-lg shadow-orange-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {authLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>{authMode === 'signin' ? 'Signing in...' : 'Creating Account...'}</span>
                    </>
                  ) : (
                    <span>{authMode === 'signin' ? 'Sign In' : 'Create Account'}</span>
                  )}
                </button>
              </form>
            </div>
          ) : (
            /* =========================================================================
               2. AUTHENTICATED: Member Profile, Orders History & Sign Out
               ========================================================================= */
            <div className="space-y-6 animate-fadeIn">
              {/* Header Card */}
              <header className="p-6 bg-white rounded-[2rem] shadow-sm border border-stone-100 flex items-center justify-between">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-16 h-16 shrink-0 bg-[#f97316] text-white rounded-2xl flex items-center justify-center text-2xl font-black shadow-md shadow-orange-500/20">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-xl font-black text-stone-900 tracking-tight truncate pr-2">
                      {displayName}
                    </h1>
                    <p className="text-xs text-stone-500 font-semibold truncate">
                      {user.email}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-stone-600 font-medium">
                      <svg className="w-3.5 h-3.5 text-stone-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                      <span className="font-semibold text-stone-700 truncate">
                        {user.phone || user.user_metadata?.phone || 'No contact number'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsEditingPhone(true)}
                        className="text-[#f97316] text-[11px] font-black hover:underline ml-0.5 shrink-0"
                      >
                        {user.phone || user.user_metadata?.phone ? 'Edit' : 'Add'}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => signOut()}
                  className="shrink-0 ml-3 w-11 h-11 flex items-center justify-center text-white bg-rose-500 hover:bg-rose-600 border border-transparent rounded-[14px] transition-all duration-200 shadow-sm hover:shadow-md hover:shadow-rose-500/25 active:scale-95"
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <svg className="w-5 h-5 text-rose-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                </button>
              </header>

              {/* Merged Loyalty Points Balance Card */}
              <div className="bg-slate-900 text-white rounded-[2rem] p-6 shadow-xl relative overflow-hidden group cursor-pointer transition-transform duration-300 hover:scale-[1.02]">
                <div className="absolute -right-10 -top-10 w-40 h-40 bg-[#f97316]/20 rounded-full blur-3xl pointer-events-none transition-all duration-500 group-hover:bg-[#f97316]/30" />

                <div className="relative z-10">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-[#f97316]">
                      Loyalty Points & Rewards
                    </span>
                  </div>

                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-4xl sm:text-5xl font-black text-white tracking-tight">
                      {isLoadingPoints ? '...' : pointsBalance}
                    </span>
                    <span className="text-lg font-bold text-white/60">Points</span>
                  </div>

                  <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-white/50 font-medium">
                    <span>Earn 1 point for every RM 1 spent.</span>
                    <svg className="w-4 h-4 text-[#f97316] opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                  </div>
                </div>
              </div>

              {/* Vouchers and Rewards Strip */}
              <div className="bg-white p-4 sm:p-5 rounded-[1.5rem] shadow-sm border border-stone-100 flex items-center gap-4 cursor-pointer hover:shadow-md hover:border-orange-100 transition-all duration-300 group">
                <div className="w-12 h-12 rounded-2xl bg-orange-50 text-[#f97316] flex items-center justify-center shrink-0 group-hover:scale-105 group-hover:bg-[#f97316] group-hover:text-white transition-all duration-300 shadow-inner">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"
                    />
                  </svg>
                </div>
                <div className="flex-grow">
                  <h4 className="text-sm font-black text-stone-900 tracking-tight group-hover:text-[#f97316] transition-colors">Member Vouchers</h4>
                  <p className="text-xs text-stone-500 font-medium mt-0.5">Exclusive voucher redemption coming soon.</p>
                </div>
                <svg className="w-4 h-4 text-stone-300 group-hover:text-[#f97316] transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
              </div>

              {/* Order Statistics Counter */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-stone-100 flex flex-col justify-center items-center hover:-translate-y-0.5 hover:shadow-md transition-all duration-300">
                  <div className="text-3xl font-black text-stone-800 mb-1 tracking-tight">
                    {isLoadingOrders ? '...' : orders.length}
                  </div>
                  <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider text-center">
                    Total Orders
                  </div>
                </div>

                <div className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-stone-100 flex flex-col justify-center items-center hover:-translate-y-0.5 hover:shadow-md transition-all duration-300">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span className="text-xl sm:text-2xl font-black text-stone-800 tracking-tight">Active</span>
                  </div>
                  <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wider text-center">
                    Account Status
                  </div>
                </div>
              </div>

              {/* Past Order History (Filtered by customer_id / user.id) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-black text-stone-900 tracking-tight">
                    Your Order History
                  </h3>
                  <span className="text-xs font-bold text-stone-400">
                    {orders.length} order{orders.length === 1 ? '' : 's'}
                  </span>
                </div>

                {isLoadingOrders ? (
                  <div className="p-8 text-center bg-white rounded-2xl border border-stone-100">
                    <div className="w-6 h-6 border-2 border-stone-300 border-t-[#f97316] rounded-full animate-spin mx-auto mb-2" />
                    <p className="text-xs font-bold text-stone-400">Loading order history...</p>
                  </div>
                ) : orders.length === 0 ? (
                  <div className="p-8 text-center bg-white rounded-2xl border border-dashed border-stone-200">
                    <p className="text-sm font-bold text-stone-600">No orders yet</p>
                    <p className="text-xs text-stone-400 mt-1">
                      Your completed and live orders will show up right here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {orders.map((ord) => (
                      <div
                        key={ord.id}
                        className="group bg-white p-4 rounded-2xl border border-stone-100 shadow-sm flex items-center justify-between hover:border-orange-100 hover:shadow-md transition-all duration-300 cursor-pointer"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-stone-50 flex items-center justify-center text-stone-400 group-hover:bg-orange-50 group-hover:text-[#f97316] transition-colors">
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>
                            </div>
                            <span className="font-black text-stone-900 text-sm tracking-tight">
                              {ord.display_id || ord.id.slice(0, 8).toUpperCase()}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 pl-10">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                ord.order_status === 'completed' || ord.status === 'completed'
                                  ? 'bg-emerald-50 text-emerald-600'
                                  : ord.order_status === 'cancelled' || ord.status === 'cancelled'
                                  ? 'bg-rose-50 text-rose-600'
                                  : 'bg-amber-50 text-amber-600'
                              }`}
                            >
                              {ord.order_status || ord.status || 'Processing'}
                            </span>
                            <span className="text-[11px] font-medium text-stone-400">
                              • {new Date(ord.created_at).toLocaleDateString('en-MY', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>

                        <div className="text-right flex flex-col items-end justify-center gap-1">
                          <div className="font-black text-stone-900 text-sm tabular-nums">
                            RM {Number(ord.total_amount || 0).toFixed(2)}
                          </div>
                          {ord.pickup_pin && (
                            <div className="text-[10px] font-black text-[#f97316] bg-orange-50 px-2 py-0.5 rounded-md border border-orange-100">
                              PIN: {ord.pickup_pin}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>


              {/* Sign Out Action Button */}
              <div className="pt-4 text-center">
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="w-full py-3.5 bg-rose-500 hover:bg-rose-600 text-white font-black text-sm rounded-2xl shadow-sm hover:shadow-md hover:shadow-rose-500/25 transition-all active:scale-[0.98] flex items-center justify-center gap-2 group border border-transparent"
                >
                  <svg className="w-4 h-4 text-rose-100 group-hover:text-white transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  Sign Out of TapauTime
                </button>
              </div>

              {/* Edit Contact Modal */}
              <ContactNumberModal
                isOpen={isEditingPhone}
                user={user}
                onClose={() => setIsEditingPhone(false)}
                onSuccess={(_phone, updatedUser) => {
                  setIsEditingPhone(false);
                  if (updatedUser) {
                    setUser(updatedUser);
                  }
                  fetchUserData();
                }}
                allowDismiss={true}
              />
            </div>
          )}
        </div>
      </div>
    </PullToRefresh>
  );
};
