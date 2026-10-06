import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  FileCheck2,
  Search,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  RefreshCw,
  Phone,
  Building,
} from 'lucide-react';

interface MerchantApplication {
  id: string;
  store_name?: string | null;
  full_name: string;
  mykad_number: string;
  phone_number: string;
  email: string;
  bank_name: string;
  bank_account_number: string;
  menu_url: string | null;
  status: 'pending' | 'under_review' | 'approved' | 'rejected';
  created_at: string;
}

export const ApplicationsScreen: React.FC = () => {
  const [applications, setApplications] = useState<MerchantApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchApplications = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('merchant_applications')
        .select('*')
        .order('created_at', { ascending: false });

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }

      const { data, error } = await query;
      if (error) throw error;
      setApplications(data || []);
    } catch (err) {
      console.error('[ApplicationsScreen] Error loading applications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();

    // Subscribe to realtime updates on merchant_applications
    const channel = supabase
      .channel('admin_merchant_applications')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'merchant_applications' },
        () => {
          fetchApplications();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filterStatus]);

  const handleUpdateStatus = async (
    id: string,
    newStatus: 'under_review' | 'approved' | 'rejected'
  ) => {
    setActionLoading(id);
    setActionMessage(null);
    try {
      if (newStatus === 'approved') {
        const targetApp = applications.find((app) => app.id === id);
        const stallName = targetApp?.store_name?.trim() || targetApp?.full_name?.trim();
        // Invoke elevated Edge Function for end-to-end provisioning
        const { data, error } = await supabase.functions.invoke('approve-merchant', {
          body: {
            application_id: id,
            stall_name: stallName,
          },
        });

        if (error) {
          throw new Error(error.message || 'Failed to execute merchant provisioning Edge Function.');
        }

        if (data?.error) {
          throw new Error(data.message || data.error);
        }

        const successMsg = data?.message || 'Merchant Approved! Temporary password is TempPassword123!';
        setActionMessage(successMsg);
        setApplications((prev) =>
          prev.map((app) => (app.id === id ? { ...app, status: 'approved' } : app))
        );
      } else {
        const { error } = await supabase
          .from('merchant_applications')
          .update({ status: newStatus })
          .eq('id', id);

        if (error) throw error;

        setActionMessage(`Application ${id.slice(0, 8)} updated to ${newStatus.replace('_', ' ')}.`);
        setApplications((prev) =>
          prev.map((app) => (app.id === id ? { ...app, status: newStatus } : app))
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update application';
      console.error('[ApplicationsScreen] Status update failed:', err);
      setActionMessage(`Error: ${msg}`);
    } finally {
      setActionLoading(null);
    }
  };

  const filtered = applications.filter((app) => {
    const q = searchQuery.toLowerCase();
    return (
      (app.store_name && app.store_name.toLowerCase().includes(q)) ||
      app.full_name.toLowerCase().includes(q) ||
      app.email.toLowerCase().includes(q) ||
      app.phone_number.includes(q) ||
      app.bank_name.toLowerCase().includes(q)
    );
  });

  const getStatusBadge = (status: MerchantApplication['status']) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-800/80">
            <CheckCircle2 className="w-3 h-3" />
            Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-950/80 text-rose-400 border border-rose-800/80">
            <XCircle className="w-3 h-3" />
            Rejected
          </span>
        );
      case 'under_review':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-sky-950/80 text-sky-400 border border-sky-800/80">
            <Clock className="w-3 h-3" />
            Under Review
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-950/80 text-amber-400 border border-amber-800/80">
            <AlertCircle className="w-3 h-3" />
            Pending
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
            <FileCheck2 className="w-6 h-6 text-orange-500" />
            <span>Merchant Onboarding Applications</span>
          </h1>
          <p className="text-xs text-stone-400 mt-1 font-medium">
            Review prospective hawkers, audit MyKad & banking credentials, and approve terminal access.
          </p>
        </div>

        <button
          onClick={fetchApplications}
          disabled={loading}
          className="self-start sm:self-auto px-4 py-2 bg-[#181615] hover:bg-stone-800 border border-stone-800 rounded-xl text-xs font-bold text-stone-300 hover:text-white transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh List</span>
        </button>
      </div>

      {actionMessage && (
        <div className="p-3.5 rounded-2xl bg-stone-900 border border-stone-800 text-xs text-stone-200 flex items-center justify-between">
          <span>{actionMessage}</span>
          <button
            onClick={() => setActionMessage(null)}
            className="text-stone-500 hover:text-white text-xs font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-[#141211] border border-stone-800/80 rounded-2xl p-4 flex flex-col md:flex-row gap-4 items-center justify-between">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-stone-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, phone, bank..."
            className="w-full bg-[#1c1917] border border-stone-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
          {['all', 'pending', 'under_review', 'approved', 'rejected'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all whitespace-nowrap cursor-pointer ${
                filterStatus === st
                  ? 'bg-orange-600 text-white shadow-md shadow-orange-600/20'
                  : 'bg-[#1c1917] text-stone-400 hover:text-stone-200 border border-stone-800'
              }`}
            >
              {st.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Applications Data Table */}
      <div className="bg-[#141211] border border-stone-800/80 rounded-3xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-800 text-[10px] uppercase tracking-widest text-stone-400 bg-[#181615]">
                <th className="py-3.5 px-6 font-bold">Store & Applicant</th>
                <th className="py-3.5 px-6 font-bold">Contact & MyKad</th>
                <th className="py-3.5 px-6 font-bold">Settlement Bank</th>
                <th className="py-3.5 px-6 font-bold">Menu File</th>
                <th className="py-3.5 px-6 font-bold">Status</th>
                <th className="py-3.5 px-6 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/60 text-xs">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-stone-500 font-medium">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-orange-500 mb-2" />
                    Loading merchant applications from Supabase...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-stone-500 font-medium">
                    No applications match the selected criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((app) => (
                  <tr key={app.id} className="hover:bg-stone-900/40 transition-colors">
                    {/* Applicant */}
                    <td className="py-4 px-6">
                      <div className="font-bold text-white text-sm">
                        {app.store_name || app.full_name}
                      </div>
                      {app.store_name && (
                        <div className="text-[11px] text-orange-400/90 font-medium mt-0.5">
                          Owner: {app.full_name}
                        </div>
                      )}
                      <div className="text-[11px] text-stone-400 font-mono mt-0.5">{app.email}</div>
                    </td>

                    {/* Contact & MyKad */}
                    <td className="py-4 px-6">
                      <div className="font-mono text-stone-300 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-emerald-500" />
                        <a
                          href={`https://wa.me/${app.phone_number.replace(/[^0-9]/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline text-emerald-400 font-bold"
                        >
                          {app.phone_number}
                        </a>
                      </div>
                      <div className="text-[11px] text-stone-500 font-mono mt-0.5">
                        NRIC: {app.mykad_number}
                      </div>
                    </td>

                    {/* Settlement Bank */}
                    <td className="py-4 px-6">
                      <div className="font-semibold text-stone-200 flex items-center gap-1.5">
                        <Building className="w-3.5 h-3.5 text-stone-400" />
                        <span>{app.bank_name}</span>
                      </div>
                      <div className="text-[11px] font-mono text-stone-400 mt-0.5">
                        Acc: {app.bank_account_number}
                      </div>
                    </td>

                    {/* Menu Attachment */}
                    <td className="py-4 px-6">
                      {app.menu_url ? (
                        <a
                          href={app.menu_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-orange-400 hover:text-orange-300 font-bold underline"
                        >
                          <span>View Menu</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        <span className="text-stone-500 text-[11px]">No file</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="py-4 px-6">{getStatusBadge(app.status)}</td>

                    {/* Actions */}
                    <td className="py-4 px-6 text-right space-x-2">
                      {app.status === 'pending' && (
                        <button
                          onClick={() => handleUpdateStatus(app.id, 'under_review')}
                          disabled={actionLoading === app.id}
                          className="px-2.5 py-1.5 bg-sky-950 hover:bg-sky-900 border border-sky-800 text-sky-300 rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                        >
                          Review
                        </button>
                      )}

                      {app.status !== 'approved' && (
                        <button
                          onClick={() => handleUpdateStatus(app.id, 'approved')}
                          disabled={actionLoading === app.id}
                          className="px-2.5 py-1.5 bg-emerald-950 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 rounded-lg font-bold text-[11px] transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center gap-1"
                        >
                          {actionLoading === app.id ? (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin" />
                              <span>Provisioning...</span>
                            </>
                          ) : (
                            <span>Approve</span>
                          )}
                        </button>
                      )}

                      {app.status !== 'rejected' && (
                        <button
                          onClick={() => handleUpdateStatus(app.id, 'rejected')}
                          disabled={actionLoading === app.id}
                          className="px-2.5 py-1.5 bg-rose-950 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-lg font-bold text-[11px] transition-colors cursor-pointer"
                        >
                          Reject
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
