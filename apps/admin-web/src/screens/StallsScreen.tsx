import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  Store,
  Search,
  ExternalLink,
  Power,
  RefreshCw,
  MapPin,
  Utensils,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  FileEdit,
  ArrowRight,
  Trash2,
} from 'lucide-react';

interface MerchantStall {
  id: string;
  owner_id: string;
  business_name: string;
  slug: string;
  is_open: boolean;
  location: { address?: string } | null;
  created_at: string;
  itemCount?: number;
}

interface StoreNameChangeRequest {
  id: string;
  merchant_id: string;
  current_name: string;
  requested_name: string;
  status: 'pending' | 'approved' | 'rejected';
  admin_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export const StallsScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'stalls' | 'name_requests'>('stalls');

  // Stalls State
  const [stalls, setStalls] = useState<MerchantStall[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);

  // Store Name Requests State
  const [nameRequests, setNameRequests] = useState<StoreNameChangeRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [nameFilter, setNameFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [nameSearchQuery, setNameSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Reject Modal State
  const [rejectModal, setRejectModal] = useState<{
    isOpen: boolean;
    requestId: string | null;
    stallName: string;
    requestedName: string;
    reason: string;
  }>({
    isOpen: false,
    requestId: null,
    stallName: '',
    requestedName: '',
    reason: '',
  });

  // Permanently Delete Stall Modal State
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    stallId: string | null;
    stallName: string;
  }>({
    isOpen: false,
    stallId: null,
    stallName: '',
  });
  const [deleteLoading, setDeleteLoading] = useState(false);

  const pendingCount = nameRequests.filter((r) => r.status === 'pending').length;

  const fetchStalls = useCallback(async () => {
    setLoading(true);
    try {
      const { data: merchantsData, error: merchantsErr } = await supabase
        .from('merchants')
        .select('*')
        .order('created_at', { ascending: false });

      if (merchantsErr) throw merchantsErr;

      // Fetch menu items count per merchant
      const { data: menuItemsData } = await supabase
        .from('menu_items')
        .select('merchant_id');

      const countMap: Record<string, number> = {};
      (menuItemsData || []).forEach((item) => {
        countMap[item.merchant_id] = (countMap[item.merchant_id] || 0) + 1;
      });

      const formatted = (merchantsData || []).map((m) => ({
        ...m,
        itemCount: countMap[m.id] || 0,
      }));

      setStalls(formatted);
    } catch (err) {
      console.error('[StallsScreen] Error loading stalls:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchNameRequests = useCallback(async () => {
    setLoadingRequests(true);
    try {
      let query = supabase
        .from('store_name_change_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (nameFilter !== 'all') {
        query = query.eq('status', nameFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setNameRequests((data || []) as StoreNameChangeRequest[]);
    } catch (err) {
      console.error('[StallsScreen] Error loading name requests:', err);
    } finally {
      setLoadingRequests(false);
    }
  }, [nameFilter]);

  useEffect(() => {
    fetchStalls();
    fetchNameRequests();

    const stallsChannel = supabase
      .channel('admin_merchants_stalls')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'merchants' }, () => {
        fetchStalls();
      })
      .subscribe();

    const requestsChannel = supabase
      .channel('admin_name_requests_sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_name_change_requests' }, () => {
        fetchNameRequests();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(stallsChannel);
      supabase.removeChannel(requestsChannel);
    };
  }, [fetchStalls, fetchNameRequests]);

  const handleToggleOpen = async (stallId: string, currentOpen: boolean) => {
    setToggleLoading(stallId);
    try {
      const { error } = await supabase
        .from('merchants')
        .update({ is_open: !currentOpen })
        .eq('id', stallId);

      if (error) throw error;

      setStalls((prev) =>
        prev.map((s) => (s.id === stallId ? { ...s, is_open: !currentOpen } : s))
      );
    } catch (err) {
      console.error('[StallsScreen] Failed to toggle stall status:', err);
    } finally {
      setToggleLoading(null);
    }
  };

  const handleApprove = async (req: StoreNameChangeRequest) => {
    setActionLoading(req.id);
    setActionMessage(null);
    try {
      const { error } = await supabase.rpc('review_store_name_change', {
        p_request_id: req.id,
        p_action: 'approve',
      });
      if (error) throw error;

      setActionMessage({
        type: 'success',
        text: `Approved! Store name updated to "${req.requested_name}".`,
      });
      fetchNameRequests();
      fetchStalls();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Failed to approve store name change.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenRejectModal = (req: StoreNameChangeRequest) => {
    setRejectModal({
      isOpen: true,
      requestId: req.id,
      stallName: req.current_name,
      requestedName: req.requested_name,
      reason: '',
    });
  };

  const handleConfirmReject = async () => {
    if (!rejectModal.requestId) return;

    setActionLoading(rejectModal.requestId);
    setActionMessage(null);
    try {
      const { error } = await supabase.rpc('review_store_name_change', {
        p_request_id: rejectModal.requestId,
        p_action: 'reject',
        p_notes: rejectModal.reason.trim() || 'Store name change was not approved by administrator.',
      });
      if (error) throw error;

      setActionMessage({
        type: 'success',
        text: `Request to rename "${rejectModal.stallName}" to "${rejectModal.requestedName}" was rejected.`,
      });
      setRejectModal({ isOpen: false, requestId: null, stallName: '', requestedName: '', reason: '' });
      fetchNameRequests();
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Failed to reject store name change.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenDeleteModal = (stall: MerchantStall) => {
    setDeleteModal({
      isOpen: true,
      stallId: stall.id,
      stallName: stall.business_name,
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal.stallId) return;
    setDeleteLoading(true);
    setActionMessage(null);
    try {
      const { data, error } = await supabase.rpc('permanently_delete_merchant', {
        p_merchant_id: deleteModal.stallId,
      });

      if (error) throw error;

      setActionMessage({
        type: 'success',
        text: (data as { message?: string })?.message || `Stall "${deleteModal.stallName}" was permanently deleted.`,
      });

      setDeleteModal({
        isOpen: false,
        stallId: null,
        stallName: '',
      });

      await fetchStalls();
    } catch (err: any) {
      console.error('[StallsScreen] Failed to permanently delete merchant:', err);
      setActionMessage({
        type: 'error',
        text: err?.message || 'Failed to permanently delete merchant.',
      });
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredStalls = stalls.filter((s) => {
    const q = searchQuery.toLowerCase();
    return (
      s.business_name.toLowerCase().includes(q) ||
      (s.slug && s.slug.toLowerCase().includes(q)) ||
      (s.location?.address && s.location.address.toLowerCase().includes(q))
    );
  });

  const filteredRequests = nameRequests.filter((r) => {
    const q = nameSearchQuery.toLowerCase();
    return (
      r.current_name.toLowerCase().includes(q) ||
      r.requested_name.toLowerCase().includes(q) ||
      r.merchant_id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <Store className="w-6 h-6 text-orange-500" />
            <span>Stalls & Store Identity</span>
          </h1>
          <p className="text-xs text-stone-400 mt-1 font-medium">
            Monitor registered hawker stalls, catalog counts, override open/close states, and review merchant store name edits.
          </p>
        </div>

        <button
          onClick={() => {
            fetchStalls();
            fetchNameRequests();
          }}
          disabled={loading || loadingRequests}
          className="self-start sm:self-auto px-4 py-2 bg-[#181615] hover:bg-stone-800 border border-stone-800 rounded-xl text-xs font-bold text-stone-300 hover:text-white transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading || loadingRequests ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Action Notification Toast */}
      {actionMessage && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-xs font-medium animate-in fade-in slide-in-from-top-2 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/70 border-emerald-800 text-emerald-300'
              : 'bg-red-950/70 border-red-800 text-red-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-stone-400 hover:text-white text-xs px-2 py-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Navigation Tab Switcher */}
      <div className="flex border-b border-stone-800 gap-6">
        <button
          onClick={() => setActiveTab('stalls')}
          className={`pb-3 font-bold text-xs tracking-wider uppercase transition-all flex items-center gap-2 border-b-2 cursor-pointer ${
            activeTab === 'stalls'
              ? 'border-orange-500 text-white'
              : 'border-transparent text-stone-500 hover:text-stone-300'
          }`}
        >
          <Store className="w-4 h-4" />
          <span>All Stalls ({stalls.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('name_requests')}
          className={`pb-3 font-bold text-xs tracking-wider uppercase transition-all flex items-center gap-2 border-b-2 cursor-pointer ${
            activeTab === 'name_requests'
              ? 'border-orange-500 text-white'
              : 'border-transparent text-stone-500 hover:text-stone-300'
          }`}
        >
          <FileEdit className="w-4 h-4" />
          <span>Store Name Requests</span>
          {pendingCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-orange-600 text-white text-[10px] font-black animate-pulse">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: ALL STALLS */}
      {activeTab === 'stalls' && (
        <div className="space-y-5">
          {/* Search Input */}
          <div className="bg-[#141211] border border-stone-800/80 rounded-2xl p-4 flex items-center">
            <div className="relative w-full max-w-md">
              <Search className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search stall by name, slug, or address..."
                className="w-full bg-[#1c1917] border border-stone-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium"
              />
            </div>
          </div>

          {/* Stalls Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {loading ? (
              <div className="col-span-full py-12 text-center text-stone-500 font-medium bg-[#141211] border border-stone-800/80 rounded-3xl">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-orange-500 mb-2" />
                Loading stalls from Supabase...
              </div>
            ) : filteredStalls.length === 0 ? (
              <div className="col-span-full py-12 text-center text-stone-500 font-medium bg-[#141211] border border-stone-800/80 rounded-3xl">
                No stalls found matching "{searchQuery}"
              </div>
            ) : (
              filteredStalls.map((stall) => (
                <div
                  key={stall.id}
                  className="bg-[#141211] border border-stone-800/80 rounded-3xl p-6 shadow-xl flex flex-col justify-between hover:border-stone-700 transition-colors"
                >
                  <div>
                    {/* Top Stall Row */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-base font-black text-white tracking-tight">
                          {stall.business_name}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="font-mono text-[11px] text-orange-400 font-semibold bg-orange-950/40 border border-orange-900/60 px-2 py-0.5 rounded-md">
                            /{stall.slug || 'no-slug'}
                          </span>
                          {stall.slug && (
                            <a
                              href={`https://app.tapautime.my/dine-in/${stall.slug}/1`}
                              target="_blank"
                              rel="noreferrer"
                              title="Open Dine-in QR Menu"
                              className="text-stone-500 hover:text-stone-300"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>

                      {/* Status Indicator */}
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          stall.is_open
                            ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/80'
                            : 'bg-stone-900 text-stone-400 border border-stone-800'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            stall.is_open ? 'bg-emerald-400 animate-pulse' : 'bg-stone-500'
                          }`}
                        />
                        {stall.is_open ? 'Open' : 'Closed'}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="mt-4 space-y-2 text-xs text-stone-400">
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                        <span className="truncate">
                          {stall.location?.address || 'No physical address configured'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Utensils className="w-3.5 h-3.5 text-stone-500 shrink-0" />
                        <span className="font-bold text-stone-300">
                          {stall.itemCount} Dishes
                        </span>
                        <span className="text-stone-600">•</span>
                        <span className="text-[11px] text-stone-500 font-mono truncate">
                          ID: {stall.id.slice(0, 8)}...
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Actions */}
                  <div className="mt-6 pt-4 border-t border-stone-800/60 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">
                      Stall Control
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleOpen(stall.id, stall.is_open)}
                        disabled={toggleLoading === stall.id || deleteLoading}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                          stall.is_open
                            ? 'bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-800/70'
                            : 'bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/80'
                        }`}
                        title={stall.is_open ? 'Temporarily pause stall ordering' : 'Open stall for ordering'}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{stall.is_open ? 'Force Close' : 'Force Open'}</span>
                      </button>

                      <button
                        onClick={() => handleOpenDeleteModal(stall)}
                        disabled={deleteLoading || toggleLoading === stall.id}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer bg-red-950/70 hover:bg-red-900/90 text-red-300 border border-red-800/80 disabled:opacity-50"
                        title="Permanently remove stall and all records"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Permanently Delete</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 2: STORE NAME REQUESTS */}
      {activeTab === 'name_requests' && (
        <div className="space-y-5">
          {/* Controls: Search and Filters */}
          <div className="bg-[#141211] border border-stone-800/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative w-full max-w-md">
              <Search className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={nameSearchQuery}
                onChange={(e) => setNameSearchQuery(e.target.value)}
                placeholder="Search request by current or requested name..."
                className="w-full bg-[#1c1917] border border-stone-800 rounded-xl pl-10 pr-4 py-2 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium"
              />
            </div>

            {/* Filter Chips */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              {(['all', 'pending', 'approved', 'rejected'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setNameFilter(filter)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer ${
                    nameFilter === filter
                      ? 'bg-orange-600 text-white shadow-md shadow-orange-600/30'
                      : 'bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-stone-200 border border-stone-800'
                  }`}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          {/* Requests List */}
          <div className="space-y-4">
            {loadingRequests ? (
              <div className="py-12 text-center text-stone-500 font-medium bg-[#141211] border border-stone-800/80 rounded-3xl">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto text-orange-500 mb-2" />
                Loading store name requests...
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="py-12 text-center text-stone-500 font-medium bg-[#141211] border border-stone-800/80 rounded-3xl">
                No store name change requests found in "{nameFilter}".
              </div>
            ) : (
              filteredRequests.map((req) => (
                <div
                  key={req.id}
                  className="bg-[#141211] border border-stone-800/80 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-stone-700 transition-colors"
                >
                  {/* Left: Store Name Comparison & Info */}
                  <div className="space-y-3 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      {/* Status Chip */}
                      <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          req.status === 'approved'
                            ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/80'
                            : req.status === 'rejected'
                            ? 'bg-red-950/80 text-red-400 border border-red-800/80'
                            : 'bg-amber-950/80 text-amber-400 border border-amber-800/80'
                        }`}
                      >
                        {req.status === 'approved' && <CheckCircle2 className="w-3 h-3" />}
                        {req.status === 'rejected' && <XCircle className="w-3 h-3" />}
                        {req.status === 'pending' && <Clock className="w-3 h-3 animate-spin" />}
                        <span>{req.status}</span>
                      </span>

                      {/* Timestamp */}
                      <span className="text-[11px] text-stone-500 font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>
                          {new Date(req.created_at).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </span>

                      <span className="text-[11px] text-stone-600 font-mono">
                        Merchant: {req.merchant_id.slice(0, 8)}...
                      </span>
                    </div>

                    {/* Name Transformation Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                      <div className="bg-stone-950/80 border border-stone-800 px-4 py-2.5 rounded-2xl">
                        <span className="text-[10px] font-bold text-stone-500 uppercase tracking-wider block">
                          Current Name
                        </span>
                        <span className="text-sm font-black text-stone-300">
                          {req.current_name}
                        </span>
                      </div>

                      <ArrowRight className="w-5 h-5 text-orange-500 hidden sm:block shrink-0" />

                      <div className="bg-orange-950/30 border border-orange-900/60 px-4 py-2.5 rounded-2xl">
                        <span className="text-[10px] font-bold text-orange-400 uppercase tracking-wider block">
                          Requested New Name
                        </span>
                        <span className="text-sm font-black text-orange-300">
                          {req.requested_name}
                        </span>
                      </div>
                    </div>

                    {/* Admin notes if present */}
                    {req.admin_notes && (
                      <div className="p-3 bg-stone-950 rounded-xl border border-stone-800 text-xs text-stone-400">
                        <span className="font-bold text-stone-300">Admin Notes: </span>
                        <span>{req.admin_notes}</span>
                      </div>
                    )}
                  </div>

                  {/* Right: Actions */}
                  {req.status === 'pending' && (
                    <div className="flex items-center gap-3 shrink-0 border-t md:border-t-0 border-stone-800/80 pt-4 md:pt-0">
                      <button
                        onClick={() => handleApprove(req)}
                        disabled={actionLoading === req.id}
                        className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{actionLoading === req.id ? 'Approving...' : 'Approve'}</span>
                      </button>

                      <button
                        onClick={() => handleOpenRejectModal(req)}
                        disabled={actionLoading === req.id}
                        className="px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-red-950/80 border border-stone-800 hover:border-red-800 text-stone-300 hover:text-red-300 font-bold text-xs tracking-wider transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Reject</span>
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Reject Confirmation Modal */}
      {rejectModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#141211] border border-stone-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h3 className="font-black text-white text-base flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-500" />
                <span>Reject Store Name Request</span>
              </h3>
              <button
                onClick={() =>
                  setRejectModal({ isOpen: false, requestId: null, stallName: '', requestedName: '', reason: '' })
                }
                className="text-stone-500 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-stone-300 space-y-2">
              <p>
                Are you sure you want to reject renaming <strong className="text-white">"{rejectModal.stallName}"</strong> to{' '}
                <strong className="text-orange-400">"{rejectModal.requestedName}"</strong>?
              </p>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-1">
                  Reason for Rejection (Optional)
                </label>
                <textarea
                  value={rejectModal.reason}
                  onChange={(e) => setRejectModal((prev) => ({ ...prev, reason: e.target.value }))}
                  placeholder="e.g. Name already in use, trademark conflict, or misleading cuisine"
                  rows={3}
                  className="w-full bg-[#1c1917] border border-stone-800 rounded-xl p-3 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() =>
                  setRejectModal({ isOpen: false, requestId: null, stallName: '', requestedName: '', reason: '' })
                }
                className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-300 text-xs font-bold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReject}
                disabled={Boolean(actionLoading)}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
              >
                {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanently Delete Merchant Modal */}
      {deleteModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#141211] border border-red-900/60 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <h3 className="font-black text-white text-base flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-red-500" />
                <span>Permanently Delete Merchant</span>
              </h3>
              <button
                onClick={() =>
                  setDeleteModal({ isOpen: false, stallId: null, stallName: '' })
                }
                disabled={deleteLoading}
                className="text-stone-500 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-stone-300 space-y-3">
              <div className="p-3 bg-red-950/40 border border-red-900/50 rounded-2xl text-red-300 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-red-200 block">DANGER: Irreversible Action</span>
                  <span>This will permanently wipe this merchant stall, menu catalog, historical orders, financial ledger entries, and merchant login account from TapauTime.</span>
                </div>
              </div>

              <p>
                Are you absolutely sure you want to permanently delete{' '}
                <strong className="text-white">"{deleteModal.stallName}"</strong>?
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() =>
                  setDeleteModal({ isOpen: false, stallId: null, stallName: '' })
                }
                disabled={deleteLoading}
                className="px-4 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-300 text-xs font-bold transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleteLoading}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-lg shadow-red-950/50"
              >
                {deleteLoading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting Permanently...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
