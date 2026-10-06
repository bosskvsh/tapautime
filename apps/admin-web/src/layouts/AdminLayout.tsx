import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAdminAuthStore } from '../stores/useAdminAuthStore';
import { supabase } from '../lib/supabase';
import {
  LayoutDashboard,
  FileCheck2,
  Store,
  Activity,
  Wallet,
  LogOut,
  Shield,
  Menu,
  X,
  ExternalLink,
  TicketPercent,
  Crown,
} from 'lucide-react';

export const AdminLayout: React.FC = () => {
  const { adminName, adminEmail, dbRoleWarning, signOut } = useAdminAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [pendingNameRequestsCount, setPendingNameRequestsCount] = useState<number>(0);
  const [pendingPromoCodesCount, setPendingPromoCodesCount] = useState<number>(0);
  const location = useLocation();

  useEffect(() => {
    let isMounted = true;

    const fetchPendingCounts = async () => {
      try {
        const [appRes, nameReqRes, promoRes] = await Promise.all([
          supabase
            .from('merchant_applications')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending'),
          supabase
            .from('store_name_change_requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending'),
          supabase
            .from('merchant_promo_codes')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending'),
        ]);

        if (isMounted) {
          if (appRes.error) console.error('[AdminLayout] Merchant application count error:', appRes.error);
          if (nameReqRes.error) console.error('[AdminLayout] Store name request count error:', nameReqRes.error);
          if (promoRes.error) console.error('[AdminLayout] Promo code count error:', promoRes.error);
          if (!appRes.error && appRes.count !== null) {
            setPendingCount(appRes.count);
          }
          if (!nameReqRes.error && nameReqRes.count !== null) {
            setPendingNameRequestsCount(nameReqRes.count);
          }
          if (!promoRes.error && promoRes.count !== null) {
            setPendingPromoCodesCount(promoRes.count);
          }
        }
      } catch (err) {
        console.error('Error fetching pending counts:', err);
      }
    };

    fetchPendingCounts();

    // Subscribe to realtime changes on merchant_applications and store_name_change_requests
    const appChannel = supabase
      .channel('admin_nav_applications')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'merchant_applications' },
        () => {
          fetchPendingCounts();
        }
      )
      .subscribe();

    const nameChannel = supabase
      .channel('admin_nav_name_requests')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'store_name_change_requests' },
        () => {
          fetchPendingCounts();
        }
      )
      .subscribe();

    const promoChannel = supabase
      .channel('admin_nav_promo_codes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'merchant_promo_codes' },
        () => {
          fetchPendingCounts();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(appChannel);
      supabase.removeChannel(nameChannel);
      supabase.removeChannel(promoChannel);
    };
  }, []);

  const navItems = [
    {
      name: 'Overview & KPIs',
      path: '/',
      icon: LayoutDashboard,
      badge: null,
    },
    {
      name: 'Merchant Applications',
      path: '/applications',
      icon: FileCheck2,
      badge: pendingCount > 0 ? `${pendingCount} PENDING` : null,
    },
    {
      name: 'Stalls & Menus',
      path: '/stalls',
      icon: Store,
      badge: pendingNameRequestsCount > 0 ? `${pendingNameRequestsCount} REQ` : null,
    },
    {
      name: 'Promo Codes',
      path: '/promo-codes',
      icon: TicketPercent,
      badge: pendingPromoCodesCount > 0 ? `${pendingPromoCodesCount} REVIEW` : null,
    },
    {
      name: 'TapauLinkPRO',
      path: '/tapaulinkpro',
      icon: Crown,
      badge: 'PRO',
    },
    {
      name: 'Live Order Monitor',
      path: '/orders',
      icon: Activity,
      badge: 'Live',
    },
    {
      name: 'Payouts & Settlement',
      path: '/payouts',
      icon: Wallet,
      badge: null,
    },
  ];

  const currentNav = navItems.find((item) =>
    item.path === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(item.path)
  );

  return (
    <div className="min-h-screen bg-[#0c0a09] text-stone-100 flex flex-col md:flex-row antialiased selection:bg-orange-600 selection:text-white">
      {/* Mobile Top App Bar */}
      <header className="md:hidden bg-[#141211] border-b border-stone-800/80 px-4 py-3.5 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-orange-600 flex items-center justify-center font-black text-white text-sm shadow-md shadow-orange-600/30">
            TT
          </div>
          <span className="font-black text-white tracking-tight text-sm">Super Admin</span>
        </div>
        <button
          onClick={() => setMobileOpen((prev) => !prev)}
          className="p-2 rounded-xl bg-stone-800 text-stone-300 hover:text-white transition-colors"
          aria-label="Toggle navigation menu"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Persistent Desktop Sidebar / Collapsible Mobile Drawer */}
      <aside
        className={`fixed md:sticky top-0 h-screen w-72 bg-[#141211] border-r border-stone-800/80 flex flex-col justify-between z-50 transition-transform duration-300 ease-in-out ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="flex flex-col flex-1 overflow-y-auto">
          {/* Brand Header */}
          <div className="p-6 border-b border-stone-800/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-orange-600 flex items-center justify-center font-black text-white text-base shadow-lg shadow-orange-600/30">
                TT
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="font-black text-white tracking-tight text-base">TapauTime</h1>
                  <span className="px-1.5 py-0.5 bg-orange-600/20 text-orange-400 border border-orange-600/30 rounded text-[9px] font-black uppercase">
                    PRO
                  </span>
                </div>
                <p className="text-[11px] font-semibold text-stone-400 flex items-center gap-1">
                  <Shield className="w-3 h-3 text-orange-500" />
                  Super Admin Console
                </p>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-1.5 flex-1">
            <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-stone-500">
              Operations & Control
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(item.path);

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center justify-between px-3.5 py-3 rounded-2xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/20 font-black'
                      : 'text-stone-400 hover:text-stone-100 hover:bg-stone-800/60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-stone-400'}`} />
                    <span>{item.name}</span>
                  </div>

                  {item.badge && (
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        isActive
                          ? 'bg-white/20 text-white'
                          : item.badge === 'Live'
                          ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/80'
                          : 'bg-amber-950/80 text-amber-400 border border-amber-800/80'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </nav>

          {/* Quick Subsystem Links */}
          <div className="p-4 border-t border-stone-800/60">
            <div className="px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-stone-500 mb-1">
              External Apps
            </div>
            <div className="space-y-1">
              <a
                href="https://app.tapautime.my"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between px-3.5 py-2 rounded-xl text-xs text-stone-400 hover:text-stone-200 hover:bg-stone-800/40 transition-colors"
              >
                <span>Customer PWA</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <a
                href="https://merchant.tapautime.my"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between px-3.5 py-2 rounded-xl text-xs text-stone-400 hover:text-stone-200 hover:bg-stone-800/40 transition-colors"
              >
                <span>Merchant Web KDS</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>

        {/* User Footer Profile */}
        <div className="p-4 border-t border-stone-800/60 bg-[#100e0d]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-9 h-9 rounded-xl bg-stone-800 border border-stone-700 flex items-center justify-center font-bold text-stone-300 text-xs shrink-0">
                {adminName.slice(0, 2).toUpperCase() || 'AD'}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-stone-200 truncate">{adminName}</p>
                <p className="text-[10px] text-stone-500 font-mono truncate">{adminEmail}</p>
              </div>
            </div>

            <button
              onClick={() => signOut()}
              title="Sign Out of Super Admin"
              className="p-2 rounded-xl text-stone-400 hover:text-red-400 hover:bg-red-950/30 transition-colors cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Desktop Top Header Bar */}
        <header className="hidden md:flex bg-[#141211]/80 backdrop-blur border-b border-stone-800/80 px-8 py-4 items-center justify-between sticky top-0 z-30">
          <div>
            <span className="text-[11px] font-bold text-stone-500 uppercase tracking-widest">
              TapauTime Core
            </span>
            <h2 className="text-lg font-black text-white tracking-tight">
              {currentNav?.name || 'Dashboard'}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-800/80 text-emerald-400 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Supabase Cloud Connected</span>
            </div>
          </div>
        </header>

        {/* Child Screen Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {dbRoleWarning && (
            <div className="mb-6 p-4 rounded-2xl bg-amber-950/40 border border-amber-800/80 text-amber-300 text-xs flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <Shield className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong>Database Role Notice:</strong> Your account ({adminEmail}) has environment admin clearance, but your database record in <code className="bg-stone-900 px-1.5 py-0.5 rounded text-amber-200">public.users</code> is missing <code className="bg-stone-900 px-1.5 py-0.5 rounded text-amber-200">role = 'admin'</code>. Some RLS-protected queries may be limited.
                </span>
              </div>
            </div>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
};
