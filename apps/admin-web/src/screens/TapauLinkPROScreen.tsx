import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Crown, Search, Loader2 } from 'lucide-react';

interface Merchant {
  id: string;
  business_name: string;
  slug: string;
  has_tapaulinkpro: boolean;
  is_open: boolean;
}

export const TapauLinkPROScreen: React.FC = () => {
  const [merchants, setMerchants] = useState<Merchant[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

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
                      <div className="text-stone-300 font-mono text-xs">{merchant.slug}</div>
                      {merchant.has_tapaulinkpro && (
                        <a 
                          href={`https://${merchant.slug}.tapautime.my`} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-[10px] text-orange-500 hover:text-orange-400 hover:underline mt-1 block"
                        >
                          {merchant.slug}.tapautime.my
                        </a>
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
    </div>
  );
};
