import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Crown, Search, Loader2, Pencil, ExternalLink, X, CheckCircle2, AlertCircle } from 'lucide-react';

interface Merchant {
  id: string;
  business_name: string;
  slug: string;
  has_tapaulinkpro: boolean;
  is_open: boolean;
}

interface EditModalState {
  merchantId: string;
  businessName: string;
  currentSlug: string;
  newSlug: string;
}

const RESERVED_SUBDOMAINS = new Set([
  'app',
  'kds',
  'merchant',
  'admin',
  'dinein',
  'dining',
  'www',
  'api',
  'mail',
  'cpanel',
  'webmail',
  'localhost',
]);

export const TapauLinkPROScreen: React.FC = () => {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editModal, setEditModal] = useState<EditModalState | null>(null);
  const [savingSlug, setSavingSlug] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchMerchants();
  }, []);

  const fetchMerchants = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('merchants')
        .select('id, business_name, slug, has_tapaulinkpro, is_open')
        .order('business_name', { ascending: true });

      if (error) throw error;
      setMerchants(data || []);
    } catch (error) {
      console.error('Error fetching merchants:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleProStatus = async (merchantId: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    
    // Optimistic update
    setMerchants((prev) => 
      prev.map((m) => (m.id === merchantId ? { ...m, has_tapaulinkpro: newStatus } : m))
    );

    try {
      const { error } = await supabase
        .from('merchants')
        .update({ has_tapaulinkpro: newStatus })
        .eq('id', merchantId);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error updating TapauLinkPRO status:', error);
      // Revert optimistic update
      setMerchants((prev) => 
        prev.map((m) => (m.id === merchantId ? { ...m, has_tapaulinkpro: currentStatus } : m))
      );
      alert('Failed to update TapauLinkPRO status. Please try again.');
    }
  };

  const validateSlug = (slug: string, currentSlug: string): string | null => {
    const trimmed = slug.trim().toLowerCase();
    if (!trimmed) {
      return 'URL slug cannot be empty.';
    }
    if (trimmed.length < 3) {
      return 'Subdomain must be at least 3 characters long.';
    }
    if (trimmed.length > 50) {
      return 'Subdomain cannot exceed 50 characters.';
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(trimmed)) {
      return 'Subdomain can only contain lowercase letters, numbers, and hyphens (cannot start or end with a hyphen).';
    }
    if (RESERVED_SUBDOMAINS.has(trimmed)) {
      return `"${trimmed}" is a reserved system subdomain and cannot be used.`;
    }
    if (trimmed !== currentSlug) {
      const isTakenLocally = merchants.some(
        (m) => m.slug.toLowerCase() === trimmed && m.id !== editModal?.merchantId
      );
      if (isTakenLocally) {
        return 'This URL / subdomain is already in use by another merchant.';
      }
    }
    return null;
  };

  const handleSaveSlug = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModal) return;

    const sanitized = editModal.newSlug.trim().toLowerCase();
    
    // If unchanged, exit cleanly
    if (sanitized === editModal.currentSlug) {
      setEditModal(null);
      return;
    }

    const err = validateSlug(sanitized, editModal.currentSlug);
    if (err) {
      setValidationError(err);
      return;
    }

    setSavingSlug(true);
    setValidationError(null);

    try {
      const { error } = await supabase
        .from('merchants')
        .update({ slug: sanitized })
        .eq('id', editModal.merchantId);

      if (error) {
        if (
          error.code === '23505' ||
          error.message?.includes('merchants_slug_key') ||
          error.message?.toLowerCase().includes('duplicate')
        ) {
          setValidationError('This URL / subdomain is already taken by another merchant.');
          return;
        }
        throw error;
      }

      // Success: update local state
      setMerchants((prev) =>
        prev.map((m) =>
          m.id === editModal.merchantId ? { ...m, slug: sanitized } : m
        )
      );

      setNotification({
        type: 'success',
        text: `TapauLinkPRO URL for "${editModal.businessName}" updated to ${sanitized}.tapautime.my`,
      });
      setEditModal(null);
      setTimeout(() => {
        setNotification(null);
      }, 4000);
    } catch (error: any) {
      console.error('Error updating merchant slug:', error);
      setValidationError(error?.message || 'Failed to update URL. Please try again.');
    } finally {
      setSavingSlug(false);
    }
  };

  const filteredMerchants = merchants.filter((m) => 
    m.business_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    m.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-black text-white flex items-center gap-2">
          <Crown className="w-7 h-7 text-orange-500" />
          TapauLinkPRO Management
        </h1>
        <p className="text-stone-400 text-sm">
          Manage TapauLinkPRO tier access for merchants. Enabling this grants them a dedicated subdomain (e.g. merchant-slug.tapautime.my)
        </p>
      </div>

      {notification && (
        <div className={`p-3.5 rounded-xl border text-xs font-medium flex items-center justify-between ${
          notification.type === 'success'
            ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300'
            : 'bg-rose-950/60 border-rose-800/80 text-rose-300'
        }`}>
          <div className="flex items-center gap-2">
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{notification.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotification(null)}
            className="text-stone-400 hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <div className="bg-[#141211] border border-stone-800/80 rounded-2xl overflow-hidden shadow-xl shadow-black/50">
        <div className="p-4 border-b border-stone-800/60 bg-[#1a1715] flex items-center gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500" />
            <input
              type="text"
              placeholder="Search merchants by name or slug..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#0c0a09] border border-stone-800/80 rounded-xl pl-10 pr-4 py-2 text-sm text-stone-200 placeholder:text-stone-600 focus:outline-none focus:border-orange-600/50 focus:ring-1 focus:ring-orange-600/50 transition-all"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-[#0c0a09] text-stone-500 font-semibold border-b border-stone-800/80">
              <tr>
                <th className="px-6 py-4">Merchant Name</th>
                <th className="px-6 py-4">Slug / Subdomain</th>
                <th className="px-6 py-4">Store Status</th>
                <th className="px-6 py-4 text-right">TapauLinkPRO</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-800/60">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-stone-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    Loading merchants...
                  </td>
                </tr>
              ) : filteredMerchants.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-stone-500">
                    No merchants found matching your search.
                  </td>
                </tr>
              ) : (
                filteredMerchants.map((merchant) => (
                  <tr key={merchant.id} className="hover:bg-stone-800/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-stone-200">{merchant.business_name}</div>
                      <div className="text-xs text-stone-500 font-mono">{merchant.id}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className="text-stone-300 font-mono text-xs font-semibold">{merchant.slug}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditModal({
                              merchantId: merchant.id,
                              businessName: merchant.business_name,
                              currentSlug: merchant.slug,
                              newSlug: merchant.slug,
                            });
                            setValidationError(null);
                          }}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium text-stone-400 hover:text-orange-400 hover:bg-stone-800/80 transition-colors"
                          title="Edit TapauLinkPRO URL"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Edit</span>
                        </button>
                      </div>
                      {merchant.has_tapaulinkpro ? (
                        <a 
                          href={`https://${merchant.slug}.tapautime.my`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-orange-500 hover:text-orange-400 hover:underline mt-1"
                        >
                          <span>{merchant.slug}.tapautime.my</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      ) : (
                        <span className="text-[10px] text-stone-500 font-mono mt-0.5 block">
                          app.tapautime.my/{merchant.slug}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        merchant.is_open 
                          ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/80' 
                          : 'bg-stone-800 text-stone-400 border border-stone-700'
                      }`}>
                        {merchant.is_open ? 'Open' : 'Closed'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          className="sr-only peer"
                          checked={merchant.has_tapaulinkpro || false}
                          onChange={() => toggleProStatus(merchant.id, merchant.has_tapaulinkpro)}
                        />
                        <div className="w-11 h-6 bg-stone-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-600 border border-stone-700/50"></div>
                      </label>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit TapauLinkPRO Subdomain / URL Modal */}
      {editModal && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="bg-[#141211] border border-stone-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-4 border-b border-stone-800/80 pb-4">
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <Crown className="w-5 h-5 text-orange-500" />
                  Edit TapauLinkPRO URL
                </h2>
                <p className="mt-1 text-xs text-stone-400">
                  Customize the unique subdomain for <span className="text-white font-semibold">{editModal.businessName}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!savingSlug) setEditModal(null);
                }}
                disabled={savingSlug}
                className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-800 hover:text-white transition-colors disabled:opacity-50"
                aria-label="Close dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSlug} className="space-y-4">
              <div>
                <label htmlFor="tapaulinkpro-subdomain" className="block text-xs font-semibold text-stone-300 mb-1.5">
                  TapauLinkPRO Subdomain / Slug
                </label>
                <div className="flex items-center rounded-xl border border-stone-800 bg-[#0c0a09] px-3 py-2.5 focus-within:border-orange-500 focus-within:ring-1 focus-within:ring-orange-500 transition-all">
                  <span className="text-xs text-stone-500 font-mono select-none">https://</span>
                  <input
                    id="tapaulinkpro-subdomain"
                    type="text"
                    value={editModal.newSlug}
                    onChange={(e) => {
                      const val = e.target.value.toLowerCase().replace(/\s+/g, '-');
                      setEditModal((prev) => (prev ? { ...prev, newSlug: val } : null));
                      if (validationError) setValidationError(null);
                    }}
                    placeholder="merchant-slug"
                    disabled={savingSlug}
                    autoFocus
                    className="flex-1 bg-transparent px-1.5 text-sm font-mono text-white placeholder:text-stone-600 focus:outline-none"
                  />
                  <span className="text-xs text-orange-500 font-mono select-none font-semibold">.tapautime.my</span>
                </div>
                <p className="mt-1.5 text-[11px] text-stone-500">
                  Only lowercase letters, numbers, and hyphens (3–50 chars). Free tier fallback:{' '}
                  <span className="font-mono text-stone-400">app.tapautime.my/{editModal.newSlug || 'slug'}</span>
                </p>
              </div>

              {validationError && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-950/40 border border-rose-900/60 text-rose-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                  <span>{validationError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-800/80">
                <button
                  type="button"
                  onClick={() => setEditModal(null)}
                  disabled={savingSlug}
                  className="min-h-[38px] rounded-xl px-4 py-2 text-xs font-bold text-stone-400 hover:bg-stone-800 hover:text-white transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingSlug}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-orange-600 px-5 py-2 text-xs font-black text-white hover:bg-orange-500 transition-colors disabled:opacity-50 shadow-lg shadow-orange-950/40"
                >
                  {savingSlug ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save URL</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

