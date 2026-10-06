import fs from 'fs';
import path from 'path';

const srcPath = path.resolve(process.argv[2] || '.');
const outPath = srcPath;

const out = `import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

interface AuthScreenProps {
  onSuccess?: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      <div className="w-full max-w-md bg-[#24201e] border border-stone-800 rounded-3xl p-8 sm:p-10 shadow-2xl relative z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-orange-600 flex items-center justify-center font-black text-white text-2xl shadow-lg shadow-orange-600/30 mb-4">
            TT
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            TapauTime Merchant
          </h1>
          <p className="text-stone-400 text-xs sm:text-sm mt-1 font-medium">
            Kitchen Display System & Merchant Hub
          </p>
        </div>

        {/* Feedback Alerts */}
        {errorMsg && (
          <div className="mb-5 p-3.5 bg-red-950/70 border border-red-800/80 rounded-2xl text-xs text-red-200 flex items-start gap-2">
            <span className="font-bold text-red-400 shrink-0">Error:</span>
            <span>{errorMsg}</span>
          </div>
        )}
        {infoMsg && (
          <div className="mb-5 p-3.5 bg-emerald-950/70 border border-emerald-800/80 rounded-2xl text-xs text-emerald-200">
            {infoMsg}
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
              className="w-full bg-[#181615] border border-stone-700 rounded-xl px-4 py-3 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-300 mb-1.5 uppercase tracking-wider">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              disabled={loading}
              autoComplete="current-password"
              className="w-full bg-[#181615] border border-stone-700 rounded-xl px-4 py-3 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 bg-orange-600 hover:bg-orange-500 active:scale-[0.99] text-white font-black text-sm rounded-xl shadow-lg shadow-orange-600/30 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              'Sign In to Stall'
            )}
          </button>
        </form>

        {/* Session helper hint */}
        <p className="mt-6 text-center text-[11px] text-stone-600 font-bold">
          Use your work email and password to sign in to your kitchen display system.
        </p>
      </div>
    </div>
  );
};
`;

fs.writeFileSync(outPath, out, 'utf8');
console.log('OK bytes:', out.length, 'path:', outPath);
