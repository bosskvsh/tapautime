import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  MerchantPaymentSettings,
  PaymentFormState,
  PaymentFormErrors,
  BankOption,
} from '../types/payment';

// Initialize Supabase Client (Ensure environment variables are configured)
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const FPX_BANKS: BankOption[] = [
  { code: 'MAYBANK', name: 'Maybank2u / Maybank Islamic' },
  { code: 'CIMB', name: 'CIMB Clicks' },
  { code: 'PUBLIC_BANK', name: 'Public Bank Online' },
  { code: 'RHB', name: 'RHB NOW' },
  { code: 'HONG_LEONG', name: 'Hong Leong Connect' },
  { code: 'AMBANK', name: 'AmOnline' },
  { code: 'BANK_ISLAM', name: 'Bank Islam' },
  { code: 'OCBC', name: 'OCBC Online Banking' },
];

export const PaymentMethodSetup: React.FC = () => {
  const [merchantId, setMerchantId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  
  const [formState, setFormState] = useState<PaymentFormState>({
    tng_duitnow_enabled: false,
    tng_duitnow_id: '',
    tng_duitnow_qr_url: '',
    grabpay_enabled: false,
    grabpay_id: '',
    fpx_enabled: false,
    fpx_bank_name: '',
    fpx_account_number: '',
    cash_enabled: true,
  });

  const [errors, setErrors] = useState<PaymentFormErrors>({});
  const [notification, setNotification] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Helper to clean spacing and hyphens from numeric / ID inputs
  const sanitizeAccountInput = (val: string): string => {
    return val.replace(/[\s-]/g, '').trim();
  };

  // Handle DuitNow QR Image File Selection
  const handleQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setErrors((prev) => ({ ...prev, tng_duitnow_qr_url: 'Image size must be less than 5MB.' }));
        return;
      }
      const reader = new FileReader();
      reader.onload = (uploadEvent) => {
        const result = uploadEvent.target?.result as string;
        setFormState((prev) => ({ ...prev, tng_duitnow_qr_url: result }));
        setErrors((prev) => {
          const newErr = { ...prev };
          delete newErr.tng_duitnow_qr_url;
          return newErr;
        });
      };
      reader.readAsDataURL(file);
    }
  };

  // Remove uploaded DuitNow QR Image
  const handleRemoveQr = () => {
    setFormState((prev) => ({ ...prev, tng_duitnow_qr_url: '' }));
  };

  // Fetch current payment settings on mount
  const fetchPaymentSettings = useCallback(async () => {
    setIsLoading(true);
    setNotification(null);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('Authentication required. Unable to fetch merchant profile.');
      }

      setMerchantId(user.id);

      const { data, error } = await supabase
        .from('merchant_payment_settings')
        .select('*')
        .eq('merchant_id', user.id)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (data) {
        const settings = data as MerchantPaymentSettings;
        setFormState({
          tng_duitnow_enabled: settings.tng_duitnow_enabled ?? false,
          tng_duitnow_id: settings.tng_duitnow_id || '',
          tng_duitnow_qr_url: settings.tng_duitnow_qr_url || '',
          grabpay_enabled: settings.grabpay_enabled ?? false,
          grabpay_id: settings.grabpay_id || '',
          fpx_enabled: settings.fpx_enabled ?? false,
          fpx_bank_name: settings.fpx_bank_name || '',
          fpx_account_number: settings.fpx_account_number || '',
          cash_enabled: settings.cash_enabled ?? true,
        });
      }
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'Failed to load merchant payment settings.',
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPaymentSettings();
  }, [fetchPaymentSettings]);

  // Handle Toggle Switch Changes (Automatically clears inputs when disabled)
  const handleToggleChange = (field: keyof PaymentFormState) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const checked = e.target.checked;
    setFormState((prev) => {
      const newState = { ...prev, [field]: checked };
      if (field === 'tng_duitnow_enabled' && !checked) {
        newState.tng_duitnow_id = '';
        newState.tng_duitnow_qr_url = '';
      }
      if (field === 'grabpay_enabled' && !checked) newState.grabpay_id = '';
      if (field === 'fpx_enabled' && !checked) {
        newState.fpx_bank_name = '';
        newState.fpx_account_number = '';
      }
      return newState;
    });

    // Clear associated errors
    setErrors((prev) => {
      const newErrors = { ...prev };
      if (field === 'tng_duitnow_enabled') {
        delete newErrors.tng_duitnow_id;
        delete newErrors.tng_duitnow_qr_url;
      }
      if (field === 'grabpay_enabled') delete newErrors.grabpay_id;
      if (field === 'fpx_enabled') {
        delete newErrors.fpx_bank_name;
        delete newErrors.fpx_account_number;
      }
      return newErrors;
    });
  };

  // Form Validation Logic
  const validateForm = (): boolean => {
    const newErrors: PaymentFormErrors = {};

    if (formState.tng_duitnow_enabled) {
      const cleanedId = sanitizeAccountInput(formState.tng_duitnow_id);
      if (!cleanedId) {
        newErrors.tng_duitnow_id = 'Touch \'n Go DuitNow ID / Phone / BRN is required when enabled.';
      } else if (cleanedId.length < 8) {
        newErrors.tng_duitnow_id = 'Invalid DuitNow ID format (minimum 8 digits required).';
      }
    }

    if (formState.grabpay_enabled) {
      if (!formState.grabpay_id.trim()) {
        newErrors.grabpay_id = 'GrabPay Merchant ID is required when enabled.';
      }
    }

    if (formState.fpx_enabled) {
      if (!formState.fpx_bank_name) {
        newErrors.fpx_bank_name = 'Please select a settlement bank for FPX.';
      }
      const cleanedAcc = sanitizeAccountInput(formState.fpx_account_number);
      if (!cleanedAcc) {
        newErrors.fpx_account_number = 'Bank account number is required when FPX is enabled.';
      } else if (!/^\d+$/.test(cleanedAcc)) {
        newErrors.fpx_account_number = 'Account number must contain digits only.';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Form Submission / Upsert Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotification(null);

    if (!validateForm()) return;

    setIsSaving(true);

    try {
      // Re-verify auth session defensively before performing mutation
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('User session invalid or expired. Please log in again.');
      }

      const activeMerchantId = user.id;
      setMerchantId(activeMerchantId);

      const payload: MerchantPaymentSettings = {
        merchant_id: activeMerchantId,
        tng_duitnow_enabled: formState.tng_duitnow_enabled,
        tng_duitnow_id: formState.tng_duitnow_enabled
          ? sanitizeAccountInput(formState.tng_duitnow_id)
          : null,
        tng_duitnow_qr_url: formState.tng_duitnow_enabled
          ? formState.tng_duitnow_qr_url || null
          : null,
        grabpay_enabled: formState.grabpay_enabled,
        grabpay_id: formState.grabpay_enabled ? formState.grabpay_id.trim() : null,
        fpx_enabled: formState.fpx_enabled,
        fpx_bank_name: formState.fpx_enabled ? formState.fpx_bank_name : null,
        fpx_account_number: formState.fpx_enabled
          ? sanitizeAccountInput(formState.fpx_account_number)
          : null,
        cash_enabled: formState.cash_enabled,
      };

      const { error } = await supabase
        .from('merchant_payment_settings')
        .upsert(payload, { onConflict: 'merchant_id' });

      if (error) throw error;

      setNotification({
        type: 'success',
        message: 'Payment method settings successfully updated!',
      });
    } catch (err: any) {
      setNotification({
        type: 'error',
        message: err.message || 'An error occurred while saving payment settings.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Loading Skeleton View
  if (isLoading) {
    return (
      <div style={{ maxWidth: '720px', padding: '24px', background: '#111827', borderRadius: '12px', color: '#fff' }}>
        <div style={{ height: '28px', width: '240px', background: '#1f2937', borderRadius: '6px', marginBottom: '16px' }} />
        <div style={{ height: '16px', width: '380px', background: '#1f2937', borderRadius: '4px', marginBottom: '32px' }} />
        {[1, 2, 3, 4].map((idx) => (
          <div key={idx} style={{ height: '72px', background: '#1f2937', borderRadius: '8px', marginBottom: '16px' }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '720px', padding: '28px', background: '#0d1117', borderRadius: '16px', border: '1px solid #30363d', color: '#e6edf3', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: '600', margin: '0 0 6px 0', color: '#ffffff' }}>
          Section 3: Payment Method Setup
        </h2>
        <p style={{ fontSize: '14px', color: '#8b949e', margin: 0 }}>
          Configure settlement channels and accepted payment gateways for your customer checkout.
        </p>
      </div>

      {notification && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '14px',
            fontWeight: '500',
            backgroundColor: notification.type === 'success' ? 'rgba(46, 160, 67, 0.15)' : 'rgba(248, 81, 73, 0.15)',
            border: `1px solid ${notification.type === 'success' ? '#2ea043' : '#f85149'}`,
            color: notification.type === 'success' ? '#3fb950' : '#f85149',
          }}
        >
          {notification.message}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Touch 'n Go / DuitNow QR Setup */}
        <div style={{ background: '#161b22', padding: '20px', borderRadius: '12px', border: '1px solid #21262d', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: formState.tng_duitnow_enabled ? '16px' : '0' }}>
            <div>
              <span style={{ fontWeight: '600', fontSize: '15px' }}>Touch 'n Go eWallet / DuitNow QR</span>
              <p style={{ fontSize: '13px', color: '#8b949e', margin: '2px 0 0 0' }}>Accept instant DuitNow QR transfers at counter</p>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px' }}>
              <input
                type="checkbox"
                checked={formState.tng_duitnow_enabled}
                onChange={handleToggleChange('tng_duitnow_enabled')}
                disabled={isSaving}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: formState.tng_duitnow_enabled ? '#238636' : '#30363d', transition: '.2s', borderRadius: '24px' }} />
            </label>
          </div>

          {formState.tng_duitnow_enabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px', color: '#c9d1d9' }}>
                  DuitNow ID / Registered Phone Number / Business Registration Number
                </label>
                <input
                  type="text"
                  value={formState.tng_duitnow_id}
                  onChange={(e) => setFormState({ ...formState, tng_duitnow_id: e.target.value })}
                  placeholder="e.g. 0123456789 or 202401099999"
                  disabled={isSaving}
                  style={{ width: '100%', padding: '10px 12px', background: '#0d1117', border: `1px solid ${errors.tng_duitnow_id ? '#f85149' : '#30363d'}`, borderRadius: '6px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' }}
                />
                {errors.tng_duitnow_id && (
                  <span style={{ color: '#f85149', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    {errors.tng_duitnow_id}
                  </span>
                )}
              </div>

              {/* Upload DuitNow QR Image Option */}
              <div style={{ paddingTop: '8px', borderTop: '1px border #21262d' }}>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px', color: '#c9d1d9' }}>
                  Upload DuitNow QR Code Image (Optional)
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {formState.tng_duitnow_qr_url ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img
                        src={formState.tng_duitnow_qr_url}
                        alt="DuitNow QR Preview"
                        style={{ width: '96px', height: '96px', objectFit: 'contain', background: '#ffffff', padding: '6px', borderRadius: '8px', border: '1px solid #30363d' }}
                      />
                      <button
                        type="button"
                        onClick={handleRemoveQr}
                        disabled={isSaving}
                        style={{ position: 'absolute', top: '-6px', right: '-6px', background: '#f85149', color: '#fff', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Remove QR Image"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px', background: '#21262d', border: '1px dashed #484f58', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', color: '#58a6ff' }}>
                      <span>📷 Upload QR Code</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleQrUpload}
                        disabled={isSaving}
                        style={{ display: 'none' }}
                      />
                    </label>
                  )}
                  <span style={{ fontSize: '12px', color: '#8b949e' }}>
                    {formState.tng_duitnow_qr_url ? 'DuitNow QR attached' : 'PNG or JPG (max 5MB)'}
                  </span>
                </div>
                {errors.tng_duitnow_qr_url && (
                  <span style={{ color: '#f85149', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    {errors.tng_duitnow_qr_url}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* GrabPay Setup */}
        <div style={{ background: '#161b22', padding: '20px', borderRadius: '12px', border: '1px solid #21262d', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: formState.grabpay_enabled ? '16px' : '0' }}>
            <div>
              <span style={{ fontWeight: '600', fontSize: '15px' }}>GrabPay</span>
              <p style={{ fontSize: '13px', color: '#8b949e', margin: '2px 0 0 0' }}>Process GrabPay wallet payments</p>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px' }}>
              <input
                type="checkbox"
                checked={formState.grabpay_enabled}
                onChange={handleToggleChange('grabpay_enabled')}
                disabled={isSaving}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: formState.grabpay_enabled ? '#238636' : '#30363d', transition: '.2s', borderRadius: '24px' }} />
            </label>
          </div>

          {formState.grabpay_enabled && (
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px', color: '#c9d1d9' }}>
                Grab Merchant Partner ID
              </label>
              <input
                type="text"
                value={formState.grabpay_id}
                onChange={(e) => setFormState({ ...formState, grabpay_id: e.target.value })}
                placeholder="e.g. GRAB-MCH-998822"
                disabled={isSaving}
                style={{ width: '100%', padding: '10px 12px', background: '#0d1117', border: `1px solid ${errors.grabpay_id ? '#f85149' : '#30363d'}`, borderRadius: '6px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' }}
              />
              {errors.grabpay_id && (
                <span style={{ color: '#f85149', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                  {errors.grabpay_id}
                </span>
              )}
            </div>
          )}
        </div>

        {/* FPX Online Banking */}
        <div style={{ background: '#161b22', padding: '20px', borderRadius: '12px', border: '1px solid #21262d', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: formState.fpx_enabled ? '16px' : '0' }}>
            <div>
              <span style={{ fontWeight: '600', fontSize: '15px' }}>FPX Online Banking</span>
              <p style={{ fontSize: '13px', color: '#8b949e', margin: '2px 0 0 0' }}>Direct bank account settlements</p>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px' }}>
              <input
                type="checkbox"
                checked={formState.fpx_enabled}
                onChange={handleToggleChange('fpx_enabled')}
                disabled={isSaving}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: formState.fpx_enabled ? '#238636' : '#30363d', transition: '.2s', borderRadius: '24px' }} />
            </label>
          </div>

          {formState.fpx_enabled && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px', color: '#c9d1d9' }}>
                  Settlement Bank
                </label>
                <select
                  value={formState.fpx_bank_name}
                  onChange={(e) => setFormState({ ...formState, fpx_bank_name: e.target.value })}
                  disabled={isSaving}
                  style={{ width: '100%', padding: '10px 12px', background: '#0d1117', border: `1px solid ${errors.fpx_bank_name ? '#f85149' : '#30363d'}`, borderRadius: '6px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' }}
                >
                  <option value="">Select Bank</option>
                  {FPX_BANKS.map((b) => (
                    <option key={b.code} value={b.code}>{b.name}</option>
                  ))}
                </select>
                {errors.fpx_bank_name && (
                  <span style={{ color: '#f85149', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    {errors.fpx_bank_name}
                  </span>
                )}
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', marginBottom: '6px', color: '#c9d1d9' }}>
                  Bank Account Number
                </label>
                <input
                  type="text"
                  value={formState.fpx_account_number}
                  onChange={(e) => setFormState({ ...formState, fpx_account_number: e.target.value })}
                  placeholder="e.g. 514012998877"
                  disabled={isSaving}
                  style={{ width: '100%', padding: '10px 12px', background: '#0d1117', border: `1px solid ${errors.fpx_account_number ? '#f85149' : '#30363d'}`, borderRadius: '6px', color: '#fff', fontSize: '14px', boxSizing: 'border-box' }}
                />
                {errors.fpx_account_number && (
                  <span style={{ color: '#f85149', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                    {errors.fpx_account_number}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Cash Payment */}
        <div style={{ background: '#161b22', padding: '20px', borderRadius: '12px', border: '1px solid #21262d', marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontWeight: '600', fontSize: '15px' }}>Cash on Pickup / Over-the-Counter</span>
              <p style={{ fontSize: '13px', color: '#8b949e', margin: '2px 0 0 0' }}>Allow customers to pay cash upon order collection</p>
            </div>
            <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px' }}>
              <input
                type="checkbox"
                checked={formState.cash_enabled}
                onChange={handleToggleChange('cash_enabled')}
                disabled={isSaving}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{ position: 'absolute', cursor: 'pointer', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: formState.cash_enabled ? '#238636' : '#30363d', transition: '.2s', borderRadius: '24px' }} />
            </label>
          </div>
        </div>

        {/* Save Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="submit"
            disabled={isSaving}
            style={{
              padding: '10px 24px',
              backgroundColor: isSaving ? '#23863690' : '#238636',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: '600',
              fontSize: '14px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {isSaving && (
              <span style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid #fff', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            )}
            {isSaving ? 'Saving Configurations...' : 'Save Payment Methods'}
          </button>
        </div>
      </form>
    </div>
  );
};
