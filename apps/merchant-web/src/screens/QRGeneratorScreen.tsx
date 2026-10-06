import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  Printer,
  QrCode,
  UtensilsCrossed,
  ShoppingBag,
  Copy,
  Check,
  ExternalLink,
} from 'lucide-react';
import { useMerchantKDSStore } from '../stores/useMerchantKDSStore';
import { supabase } from '../lib/supabase';

export interface QRGeneratorScreenProps {
  embedded?: boolean;
}

export const QRGeneratorScreen: React.FC<QRGeneratorScreenProps> = ({ embedded = false }) => {
  const [qrMode, setQrMode] = useState<'tables' | 'counter'>('tables');
  const [tableCount, setTableCount] = useState<number>(10);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const { merchantName, merchantSlug, merchantId, setMerchantSlug } = useMerchantKDSStore();
  const [activeSlug, setActiveSlug] = useState<string>(merchantSlug || '');

  // Ensure slug is resolved if not already present in the store
  useEffect(() => {
    if (merchantSlug) {
      setActiveSlug(merchantSlug);
      return;
    }

    const fetchSlug = async () => {
      try {
        if (merchantId) {
          const { data } = await supabase
            .from('merchants')
            .select('slug')
            .eq('id', merchantId)
            .maybeSingle();

          if (data?.slug) {
            setActiveSlug(data.slug);
            setMerchantSlug(data.slug);
            return;
          }
        }

        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session?.user?.id) {
          const { data } = await supabase
            .from('merchants')
            .select('slug')
            .or(`owner_id.eq.${session.user.id},id.eq.${session.user.id}`)
            .limit(1)
            .maybeSingle();

          if (data?.slug) {
            setActiveSlug(data.slug);
            setMerchantSlug(data.slug);
          }
        }
      } catch (err) {
        console.warn('[QRGeneratorScreen] Failed to fetch merchant slug:', err);
      }
    };

    fetchSlug();
  }, [merchantId, merchantSlug, setMerchantSlug]);

  const handleTableCountChange = (value: number) => {
    if (isNaN(value)) return;
    const clamped = Math.max(1, Math.min(50, Math.floor(value)));
    setTableCount(clamped);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 3000);
  };

  const resolvedSlug = activeSlug || 'store';
  const counterUrl = `https://app.tapautime.my/${resolvedSlug}`;
  const tableNumbers = Array.from({ length: tableCount }, (_, i) => i + 1);

  return (
    <div className={embedded ? 'space-y-6 print:p-0 print:m-0 print:max-w-none' : 'p-4 sm:p-6 max-w-7xl mx-auto space-y-6 print:p-0 print:m-0 print:max-w-none pb-24 md:pb-8'}>
      {/* Screen Mode Header & Control Bar */}
      <div className="print:hidden space-y-4">
        {!embedded && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-800 pb-5">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
                  <QrCode className="w-7 h-7 text-orange-500" />
                  <span>QR Code Generator</span>
                </h1>
                <span className="px-2.5 py-0.5 rounded-full bg-orange-600/20 text-orange-400 border border-orange-500/30 text-[11px] font-mono font-bold">
                  {merchantName || 'Your Stall'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-stone-400 mt-1">
                Generate and print high-resolution QR codes for dine-in tables and your stall counter standee.
              </p>
            </div>
          </div>
        )}

        {/* Mode Selector Tabs & Print Action */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 bg-stone-900 p-1.5 rounded-2xl border border-stone-800 w-full sm:max-w-md">
            <button
              type="button"
              onClick={() => setQrMode('tables')}
              className={`min-h-[40px] flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                qrMode === 'tables'
                  ? 'bg-orange-600 text-white shadow-md'
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              <UtensilsCrossed className="w-4 h-4" />
              <span>Dine-In Tables (1-50)</span>
            </button>
            <button
              type="button"
              onClick={() => setQrMode('counter')}
              className={`min-h-[40px] flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                qrMode === 'counter'
                  ? 'bg-orange-600 text-white shadow-md'
                  : 'text-stone-400 hover:text-white'
              }`}
            >
              <ShoppingBag className="w-4 h-4" />
              <span>Stallfront Takeaway Standee</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handlePrint}
            className="min-h-[44px] px-6 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 active:scale-95 text-white font-black text-xs tracking-wide shadow-lg shadow-orange-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            <Printer className="w-4 h-4" />
            <span>Print Current QR Codes</span>
          </button>
        </div>

        {/* Mode 1 Configuration Bar: Tables */}
        {qrMode === 'tables' && (
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-3 flex-wrap">
              <label htmlFor="table-count-input" className="text-xs font-bold text-stone-300 uppercase tracking-wider">
                Number of Tables (Max 50):
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleTableCountChange(tableCount - 1)}
                  className="w-9 h-9 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold flex items-center justify-center transition-colors cursor-pointer"
                  disabled={tableCount <= 1}
                >
                  -
                </button>
                <input
                  id="table-count-input"
                  type="number"
                  min={1}
                  max={50}
                  value={tableCount}
                  onChange={(e) => handleTableCountChange(parseInt(e.target.value, 10))}
                  className="w-20 text-center bg-stone-950 border border-stone-700 rounded-lg py-1.5 text-sm font-mono font-bold text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <button
                  type="button"
                  onClick={() => handleTableCountChange(tableCount + 1)}
                  className="w-9 h-9 rounded-lg bg-stone-800 hover:bg-stone-700 text-stone-200 font-bold flex items-center justify-center transition-colors cursor-pointer"
                  disabled={tableCount >= 50}
                >
                  +
                </button>
              </div>

              {/* Quick Presets */}
              <div className="flex items-center gap-1.5 ml-2">
                {[5, 10, 15, 20, 30].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setTableCount(preset)}
                    className={`min-h-[32px] px-2.5 py-1 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                      tableCount === preset
                        ? 'bg-orange-600 border-orange-500 text-white'
                        : 'bg-stone-800 border-stone-700 text-stone-400 hover:text-white'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs text-stone-400">
              Previewing: <span className="text-stone-200 font-bold">{tableCount}</span> table card
              {tableCount > 1 ? 's' : ''} • Target URL:{' '}
              <code className="text-orange-400 bg-stone-950 px-1.5 py-0.5 rounded text-[11px] font-mono">
                https://dinein.tapautime.my/{resolvedSlug}/[table]
              </code>
            </div>
          </div>
        )}

        {/* Mode 2 Configuration Bar: Counter Standee */}
        {qrMode === 'counter' && (
          <div className="bg-stone-900 border border-stone-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xl">
            <div>
              <h3 className="text-sm font-bold text-white">Stallfront Takeaway Standee QR</h3>
              <p className="text-xs text-stone-400 mt-0.5">
                Place this QR standee at your counter so customers can scan to order takeaway without queueing.
              </p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => handleCopyUrl(counterUrl)}
                className="min-h-[44px] flex-1 sm:flex-none px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 text-xs font-bold rounded-xl border border-stone-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedUrl === counterUrl ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span>Copied Link</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Menu Link</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mode 1: Printable Table QR Grid */}
      {qrMode === 'tables' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 print:grid-cols-3 print:gap-4 print:bg-white print:text-stone-900">
          {tableNumbers.map((tableNum) => {
            const qrTargetUrl = `https://dinein.tapautime.my/${resolvedSlug}/${tableNum}`;

            return (
              <div
                key={tableNum}
                style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
                className="bg-stone-900 border-2 border-stone-800 rounded-3xl p-6 flex flex-col items-center justify-between text-center shadow-xl transition-all print:bg-white print:border-2 print:border-black print:rounded-2xl print:p-5 print:shadow-none print:break-inside-avoid print:page-break-inside-avoid"
              >
                {/* Card Header: Stall Brand */}
                <div className="w-full border-b border-stone-800 pb-3 mb-4 print:border-stone-300">
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-orange-600 print:bg-black flex items-center justify-center font-black text-white text-[10px]">
                      TT
                    </span>
                    <span className="text-xs sm:text-sm font-black text-stone-200 print:text-black tracking-tight uppercase truncate max-w-[200px]">
                      {merchantName || 'TapauTime Stall'}
                    </span>
                  </div>
                  <div className="text-[10px] text-stone-400 print:text-stone-600 font-medium mt-0.5">
                    Dine-In Contactless Ordering
                  </div>
                </div>

                {/* QR Code Container */}
                <div className="p-4 bg-white rounded-2xl shadow-inner border border-stone-200 my-2 print:p-3 print:border-2 print:border-black">
                  <QRCodeSVG
                    value={qrTargetUrl}
                    size={160}
                    level="H"
                    includeMargin={false}
                    className="w-36 h-36 sm:w-40 sm:h-40 print:w-36 print:h-36"
                  />
                </div>

                {/* Card Footer: Table Identification & CTA */}
                <div className="w-full mt-4 pt-3 border-t border-stone-800 print:border-stone-300 space-y-1">
                  <div className="text-2xl sm:text-3xl font-black text-white print:text-black tracking-tight">
                    Table {tableNum}
                  </div>
                  <div className="text-xs font-bold text-orange-400 print:text-stone-800 uppercase tracking-wider">
                    Scan to Order
                  </div>
                  <div className="text-[9px] text-stone-500 print:text-stone-500 font-mono pt-1 truncate">
                    dinein.tapautime.my/{resolvedSlug}/{tableNum}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Mode 2: Large Stallfront Counter Standee Display */}
      {qrMode === 'counter' && (
        <div className="flex justify-center print:block">
          <div
            style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
            className="w-full max-w-md bg-stone-900 border-2 border-stone-800 rounded-3xl p-8 flex flex-col items-center text-center shadow-2xl print:bg-white print:border-2 print:border-black print:rounded-2xl print:p-6 print:shadow-none print:max-w-full"
          >
            {/* Counter Standee Brand Banner */}
            <div className="w-full border-b border-stone-800 pb-4 mb-6 print:border-stone-300">
              <div className="w-12 h-12 rounded-2xl bg-orange-600 print:bg-black flex items-center justify-center font-black text-white text-lg mx-auto mb-2 shadow-lg shadow-orange-600/30 print:shadow-none">
                TT
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white print:text-black tracking-tight uppercase">
                {merchantName || 'TapauTime Stall'}
              </h2>
              <p className="text-xs text-stone-400 print:text-stone-600 font-medium mt-1">
                Official Takeaway & Self-Pickup Order Standee
              </p>
            </div>

            {/* High Resolution QR Code Frame */}
            <div className="p-6 bg-white rounded-3xl shadow-inner border border-stone-200 my-2 print:p-4 print:border-2 print:border-black">
              <QRCodeSVG
                value={counterUrl}
                size={240}
                level="H"
                includeMargin={false}
                className="w-56 h-56 sm:w-64 sm:h-64 print:w-60 print:h-60"
              />
            </div>

            {/* Standee Call to Action */}
            <div className="w-full mt-6 pt-4 border-t border-stone-800 print:border-stone-300 space-y-2">
              <div className="text-2xl font-black text-orange-400 print:text-black uppercase tracking-wider">
                Scan to Browse & Order
              </div>
              <p className="text-xs text-stone-300 print:text-stone-700">
                Pay online via DuitNow QR • Collect when food is ready
              </p>
              <div className="text-xs text-stone-500 font-mono pt-2">
                {counterUrl}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
