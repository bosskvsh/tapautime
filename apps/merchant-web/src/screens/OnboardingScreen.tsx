import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

interface OnboardingScreenProps {
  onNavigateToLogin?: () => void;
}

interface ApplicationFormState {
  full_name: string;
  store_name: string;
  mykad_number: string;
  phone_number: string;
  email: string;
  bank_name: string;
  bank_account_number: string;
  menu_url: string;
  menu_file_name: string;
}

const MALAYSIAN_BANKS = [
  'Maybank (Malayan Banking Berhad)',
  'CIMB Bank Berhad',
  'Public Bank Berhad',
  'RHB Bank Berhad',
  'Hong Leong Bank Berhad',
  'AmBank (M) Berhad',
  'Bank Islam Malaysia Berhad',
  'Affin Bank Berhad',
  'Alliance Bank Malaysia Berhad',
  'Standard Chartered Bank Malaysia',
  'HSBC Bank Malaysia',
  'Touch \'n Go eWallet Merchant',
];

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ onNavigateToLogin }) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [formData, setFormData] = useState<ApplicationFormState>({
    full_name: '',
    store_name: '',
    mykad_number: '',
    phone_number: '',
    email: '',
    bank_name: '',
    bank_account_number: '',
    menu_url: '',
    menu_file_name: '',
  });

  const [menuFile, setMenuFile] = useState<File | null>(null);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Handle Input Changes
  const handleInputChange = (field: keyof ApplicationFormState, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrorMessage(null);
  };

  // Step 1 -> Step 2: Validate form & upload menu document
  const handleStep1Next = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validation
    if (!formData.store_name.trim()) {
      setErrorMessage('Please enter your store name.');
      return;
    }
    if (!formData.full_name.trim()) {
      setErrorMessage('Please enter your full name as per MyKad.');
      return;
    }
    if (!formData.mykad_number.trim()) {
      setErrorMessage('Please enter your MyKad / NRIC number.');
      return;
    }
    if (!formData.phone_number.trim()) {
      setErrorMessage('Please enter your active contact phone number.');
      return;
    }
    if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      setErrorMessage('Please provide a valid business email address.');
      return;
    }
    if (!formData.bank_name.trim()) {
      setErrorMessage('Please select your settlement bank.');
      return;
    }
    if (!formData.bank_account_number.trim()) {
      setErrorMessage('Please enter your bank account number.');
      return;
    }
    if (!menuFile && !formData.menu_url) {
      setErrorMessage('Please upload a copy of your stall menu (PDF or image).');
      return;
    }

    // Upload menu file to Supabase storage if newly selected
    if (menuFile) {
      setIsProcessing(true);
      try {
        const fileExt = menuFile.name.split('.').pop() || 'png';
        const sanitizedBaseName = menuFile.name.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 20);
        const filePath = `menus/${Date.now()}_${sanitizedBaseName}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('merchant-documents')
          .upload(filePath, menuFile, {
            cacheControl: '3600',
            upsert: false,
          });

        if (uploadError) {
          throw uploadError;
        }

        const { data: publicUrlData } = supabase.storage
          .from('merchant-documents')
          .getPublicUrl(filePath);

        setFormData((prev) => ({
          ...prev,
          menu_url: publicUrlData.publicUrl,
          menu_file_name: menuFile.name,
        }));

        setStep(2);
      } catch (err: unknown) {
        console.error('[Onboarding] Menu upload failed:', err);
        const msg = err instanceof Error ? err.message : 'Failed to upload menu file.';
        setErrorMessage(`Upload error: ${msg}`);
      } finally {
        setIsProcessing(false);
      }
    } else {
      setStep(2);
    }
  };

  // Step 2 -> Step 3: Terms agreed
  const handleStep2Next = () => {
    if (!termsAgreed) {
      setErrorMessage('You must accept the terms and conditions to proceed.');
      return;
    }
    setErrorMessage(null);
    setStep(3);
  };

  // Step 3 -> Step 4: Submit Application to Database
  const handleSubmitApplication = async () => {
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const { error: insertError } = await supabase
        .from('merchant_applications')
        .insert([
          {
            full_name: formData.full_name.trim(),
            store_name: formData.store_name.trim(),
            mykad_number: formData.mykad_number.trim(),
            phone_number: formData.phone_number.trim(),
            email: formData.email.trim(),
            bank_name: formData.bank_name.trim(),
            bank_account_number: formData.bank_account_number.trim(),
            menu_url: formData.menu_url || null,
            status: 'pending',
          },
        ]);

      if (insertError) {
        throw insertError;
      }

      setStep(4);
    } catch (err: unknown) {
      console.error('[Onboarding] Submission failed:', err);
      const msg = err instanceof Error ? err.message : 'Submission failed. Please try again.';
      setErrorMessage(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1c1917] text-stone-100 flex flex-col justify-center items-center px-4 py-8 sm:py-12 selection:bg-orange-600 selection:text-white relative overflow-x-hidden">
      {/* Background ambient lighting matching dark theme */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-orange-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-amber-700/10 rounded-full blur-3xl pointer-events-none" />

      {/* Main Wizard Container */}
      <div className="w-full max-w-2xl bg-[#24201e] border border-stone-800 rounded-3xl p-6 sm:p-10 shadow-2xl relative z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-orange-600 flex items-center justify-center font-black text-white text-xl shadow-lg shadow-orange-600/30 mb-3">
            TT
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            TapauTime Merchant Registration
          </h1>
          <p className="text-stone-400 text-xs sm:text-sm mt-1 font-medium">
            Join the digital hawker revolution. Onboard your kitchen in minutes.
          </p>
        </div>

        {/* Multi-Step Indicator */}
        {step < 4 && (
          <div className="mb-8">
            <div className="flex items-center justify-between text-xs font-bold text-stone-400 mb-2">
              <span className={step >= 1 ? 'text-orange-500' : ''}>1. Stall Details</span>
              <span className={step >= 2 ? 'text-orange-500' : ''}>2. Agreement</span>
              <span className={step >= 3 ? 'text-orange-500' : ''}>3. Review</span>
            </div>
            <div className="w-full bg-[#181615] h-2 rounded-full overflow-hidden border border-stone-800">
              <div
                className="bg-orange-600 h-full transition-all duration-300 rounded-full"
                style={{ width: `${(step / 3) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Error Alert Banner */}
        {errorMessage && (
          <div className="mb-6 p-4 bg-red-950/70 border border-red-800/80 rounded-2xl text-xs text-red-200 flex items-start gap-2 shadow-lg">
            <span className="font-bold text-red-400 shrink-0">Error:</span>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* STEP 1: Application Form */}
        {step === 1 && (
          <form onSubmit={handleStep1Next} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1.5 uppercase tracking-wider">
                  Store Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.store_name}
                  onChange={(e) => handleInputChange('store_name', e.target.value)}
                  placeholder="e.g. Ah Hock Hainan Chicken Rice"
                  className="w-full bg-[#181615] border border-stone-700 rounded-xl px-4 py-3 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1.5 uppercase tracking-wider">
                  Full Name (as per MyKad) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) => handleInputChange('full_name', e.target.value)}
                  placeholder="e.g. Tan Ah Hock"
                  className="w-full bg-[#181615] border border-stone-700 rounded-xl px-4 py-3 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1.5 uppercase tracking-wider">
                  MyKad / NRIC Number *
                </label>
                <input
                  type="text"
                  required
                  value={formData.mykad_number}
                  onChange={(e) => handleInputChange('mykad_number', e.target.value)}
                  placeholder="e.g. 850101-14-5567"
                  className="w-full bg-[#181615] border border-stone-700 rounded-xl px-4 py-3 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1.5 uppercase tracking-wider">
                  Phone Number (WhatsApp Active) *
                </label>
                <input
                  type="tel"
                  required
                  value={formData.phone_number}
                  onChange={(e) => handleInputChange('phone_number', e.target.value)}
                  placeholder="e.g. +6012-3456789"
                  className="w-full bg-[#181615] border border-stone-700 rounded-xl px-4 py-3 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1.5 uppercase tracking-wider">
                  Business / Contact Email *
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="e.g. owner@stall.my"
                  className="w-full bg-[#181615] border border-stone-700 rounded-xl px-4 py-3 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1.5 uppercase tracking-wider">
                  Settlement Bank Name *
                </label>
                <select
                  required
                  value={formData.bank_name}
                  onChange={(e) => handleInputChange('bank_name', e.target.value)}
                  className="w-full bg-[#181615] border border-stone-700 rounded-xl px-4 py-3 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
                >
                  <option value="">Select Settlement Bank...</option>
                  {MALAYSIAN_BANKS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-300 mb-1.5 uppercase tracking-wider">
                Bank Account Number *
              </label>
              <input
                type="text"
                required
                value={formData.bank_account_number}
                onChange={(e) => handleInputChange('bank_account_number', e.target.value)}
                placeholder="e.g. 514012345678"
                className="w-full bg-[#181615] border border-stone-700 rounded-xl px-4 py-3 text-sm text-stone-100 placeholder-stone-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all"
              />
            </div>

            {/* Copy of Menu File Upload */}
            <div>
              <label className="block text-xs font-bold text-stone-300 mb-1.5 uppercase tracking-wider">
                Copy of Menu (PDF or Image) *
              </label>
              <div className="relative border-2 border-dashed border-stone-700 hover:border-orange-500/60 rounded-2xl p-4 bg-[#181615] transition-colors text-center">
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setMenuFile(e.target.files[0]);
                      setErrorMessage(null);
                    }
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center justify-center pointer-events-none">
                  <svg
                    className="w-8 h-8 text-stone-400 mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <p className="text-xs font-semibold text-stone-300">
                    {menuFile
                      ? `Selected: ${menuFile.name} (${(menuFile.size / 1024).toFixed(0)} KB)`
                      : formData.menu_file_name
                      ? `Uploaded: ${formData.menu_file_name}`
                      : 'Click or drag your menu file (PDF, PNG, JPG)'}
                  </p>
                  <p className="text-[10px] text-stone-500 mt-0.5">Maximum file size: 10MB</p>
                </div>
              </div>
            </div>

            <div className="pt-4 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={onNavigateToLogin}
                className="px-5 py-3 text-xs font-bold text-stone-400 hover:text-white transition-colors cursor-pointer"
              >
                Back to Login
              </button>

              <button
                type="submit"
                disabled={isProcessing}
                className="py-3 px-6 bg-orange-600 hover:bg-orange-500 active:scale-[0.99] text-white font-black text-sm rounded-xl shadow-lg shadow-orange-600/30 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Uploading Menu...</span>
                  </>
                ) : (
                  <>
                    <span>Next: Agreement</span>
                    <span>&rarr;</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* STEP 2: Terms and Conditions */}
        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg font-black text-white">TapauTime Merchant Terms & Conditions</h2>

            <div className="h-64 sm:h-72 overflow-y-auto bg-[#181615] border border-stone-800 rounded-2xl p-4 text-xs text-stone-300 leading-relaxed space-y-3 font-mono">
              <p className="font-bold text-orange-400">1. MERCHANT SERVICE PARTICIPATION</p>
              <p>
                By enrolling as a TapauTime Merchant Partner, you agree to fulfill pickup and dine-in food orders in accordance with platform quality standards, preparation timelines, and food safety regulations mandated by the Malaysian Ministry of Health.
              </p>

              <p className="font-bold text-orange-400">2. FINANCIAL SPLIT & PLATFORM COMMISSION</p>
              <p>
                TapauTime applies a transparent 5.0% standard platform commission on captured customer gross orders. 95.0% net payout is credited to your Merchant Wallet automatically upon order completion and available for periodic bank withdrawal.
              </p>

              <p className="font-bold text-orange-400">3. KITCHEN DISPLAY & TERMINAL OPERATIONS</p>
              <p>
                Merchants agree to keep their web/tablet KDS terminal connected during operating hours to receive realtime orders, manage item availability, and update order statuses ('Accepted', 'Preparing', 'Ready').
              </p>

              <p className="font-bold text-orange-400">4. SETTLEMENT & BANKING ACCURACY</p>
              <p>
                Payout settlements are remitted strictly into the verified Malaysian bank account declared in your registration. Payout processing typically completes within 5-7 business working days.
              </p>

              <p className="font-bold text-orange-400">5. DATA INTEGRITY & CODE OF CONDUCT</p>
              <p>
                Merchants shall not collect customer contact information for unauthorized outside marketing or circumvent the TapauTime online ordering and loyalty framework.
              </p>
            </div>

            <div className="flex items-start gap-3 p-3 bg-[#181615] border border-stone-800 rounded-xl">
              <input
                type="checkbox"
                id="agree-terms"
                checked={termsAgreed}
                onChange={(e) => setTermsAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-stone-700 text-orange-600 focus:ring-orange-500 bg-stone-900 cursor-pointer"
              />
              <label htmlFor="agree-terms" className="text-xs text-stone-300 cursor-pointer select-none">
                I have read, understood, and agree to the <span className="font-bold text-white">TapauTime Merchant Terms and Conditions</span>.
              </label>
            </div>

            <div className="pt-2 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-5 py-3 text-xs font-bold text-stone-400 hover:text-white transition-colors cursor-pointer"
              >
                &larr; Back
              </button>

              <button
                type="button"
                onClick={handleStep2Next}
                disabled={!termsAgreed}
                className="py-3 px-6 bg-orange-600 hover:bg-orange-500 active:scale-[0.99] text-white font-black text-sm rounded-xl shadow-lg shadow-orange-600/30 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <span>Next: Review Details</span>
                <span>&rarr;</span>
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Review & Submit */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-black text-white">Review Your Application</h2>
              <p className="text-xs text-stone-400">Please verify your details before final submission.</p>
            </div>

            <div className="bg-[#181615] border border-stone-800 rounded-2xl p-4 sm:p-5 space-y-3 text-xs">
              <div className="flex justify-between border-b border-stone-800 pb-2">
                <span className="text-stone-400">Store Name</span>
                <span className="font-bold text-orange-400 text-sm">{formData.store_name}</span>
              </div>
              <div className="flex justify-between border-b border-stone-800 pb-2">
                <span className="text-stone-400">Full Name</span>
                <span className="font-bold text-stone-100">{formData.full_name}</span>
              </div>
              <div className="flex justify-between border-b border-stone-800 pb-2">
                <span className="text-stone-400">MyKad / NRIC</span>
                <span className="font-mono font-bold text-stone-100">{formData.mykad_number}</span>
              </div>
              <div className="flex justify-between border-b border-stone-800 pb-2">
                <span className="text-stone-400">Phone Number</span>
                <span className="font-mono font-bold text-stone-100">{formData.phone_number}</span>
              </div>
              <div className="flex justify-between border-b border-stone-800 pb-2">
                <span className="text-stone-400">Email Address</span>
                <span className="font-bold text-stone-100">{formData.email}</span>
              </div>
              <div className="flex justify-between border-b border-stone-800 pb-2">
                <span className="text-stone-400">Settlement Bank</span>
                <span className="font-bold text-stone-100">{formData.bank_name}</span>
              </div>
              <div className="flex justify-between border-b border-stone-800 pb-2">
                <span className="text-stone-400">Account Number</span>
                <span className="font-mono font-bold text-stone-100">{formData.bank_account_number}</span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-stone-400">Menu Copy</span>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800/80">
                    Uploaded: Yes ({formData.menu_file_name || 'Attached'})
                  </span>
                  {formData.menu_url && (
                    <a
                      href={formData.menu_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-orange-400 hover:text-orange-300 underline text-[11px] font-bold"
                    >
                      View
                    </a>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between gap-4">
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={isProcessing}
                className="px-5 py-3 text-xs font-bold text-stone-400 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
              >
                &larr; Back
              </button>

              <button
                type="button"
                onClick={handleSubmitApplication}
                disabled={isProcessing}
                className="py-3 px-6 bg-orange-600 hover:bg-orange-500 active:scale-[0.99] text-white font-black text-sm rounded-xl shadow-lg shadow-orange-600/30 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                {isProcessing ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Submitting Application...</span>
                  </>
                ) : (
                  'Submit Application'
                )}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Success View */}
        {step === 4 && (
          <div className="flex flex-col items-center text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-950/80 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 mb-2">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h2 className="text-2xl font-black text-white">Application Submitted!</h2>
            <p className="text-stone-300 text-sm max-w-md leading-relaxed">
              Our onboarding team will review your stall details and contact you via WhatsApp / email shortly to activate your kitchen terminal.
            </p>

            <div className="pt-4 w-full max-w-xs">
              <button
                type="button"
                onClick={onNavigateToLogin}
                className="w-full py-3 px-4 bg-orange-600 hover:bg-orange-500 active:scale-[0.99] text-white font-black text-sm rounded-xl shadow-lg shadow-orange-600/30 transition-all cursor-pointer"
              >
                Return to Login
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
