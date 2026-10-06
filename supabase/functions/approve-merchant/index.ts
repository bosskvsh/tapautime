// @ts-nocheck
// =============================================================================
// SUPABASE EDGE FUNCTION: APPROVE MERCHANT
// Elevated privilege provisioning lifecycle for prospective hawkers
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Supabase environment variables (URL or SERVICE_ROLE_KEY) are missing.');
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // -------------------------------------------------------------------------
    // Security Gate: Strict caller authentication & admin role verification
    // -------------------------------------------------------------------------
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'UNAUTHORIZED', message: 'Missing Authorization header.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (token !== supabaseServiceRoleKey) {
      const { data: { user: callerUser }, error: authErr } = await supabaseAdmin.auth.getUser(token);
      if (authErr || !callerUser) {
        return new Response(
          JSON.stringify({ error: 'UNAUTHORIZED', message: 'Invalid authentication session.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: callerProfile, error: profileErr } = await supabaseAdmin
        .from('users')
        .select('role')
        .eq('id', callerUser.id)
        .maybeSingle();

      if (profileErr || callerProfile?.role !== 'admin') {
        return new Response(
          JSON.stringify({ error: 'FORBIDDEN', message: 'Unauthorized: Only platform administrators can approve merchant applications.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    const body = await req.json().catch(() => ({}));
    const { application_id } = body;

    if (!application_id) {
      return new Response(
        JSON.stringify({ error: 'MISSING_APPLICATION_ID', message: 'application_id is strictly required.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // -------------------------------------------------------------------------
    // Step 1: Fetch Application from public.merchant_applications
    // -------------------------------------------------------------------------
    const { data: app, error: fetchErr } = await supabaseAdmin
      .from('merchant_applications')
      .select('*')
      .eq('id', application_id)
      .single();

    if (fetchErr || !app) {
      return new Response(
        JSON.stringify({ error: 'APPLICATION_NOT_FOUND', message: `Application ${application_id} not found.` }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const email = (app.email || '').trim().toLowerCase();
    if (!email) {
      return new Response(
        JSON.stringify({ error: 'INVALID_EMAIL', message: 'Application is missing a valid email address.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { reprovision } = body;
    if (app.status === 'approved' && !reprovision) {
      // Check if auth user exists for this email
      const { data: userList } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      const existingAuthUser = userList?.users?.find((u) => u.email?.toLowerCase() === email);

      if (existingAuthUser) {
        const { data: existingStall } = await supabaseAdmin
          .from('merchants')
          .select('id')
          .eq('owner_id', existingAuthUser.id)
          .maybeSingle();

        if (existingStall) {
          return new Response(
            JSON.stringify({
              success: true,
              message: 'Application is already approved and stall is active.',
              application_id: app.id,
              status: 'approved',
              merchant_id: existingStall.id,
              owner_id: existingAuthUser.id,
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      // If either auth user or merchant stall is missing, continue through provisioning pipeline
    }

    // -------------------------------------------------------------------------
    // Step 2: Auth Creation (Stage 1)
    // -------------------------------------------------------------------------
    const tempPassword = 'TempPassword123!';
    let userId: string | null = null;
    let createdNewUser = false;

    const { data: authCreateData, error: authCreateErr } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        full_name: app.full_name,
        phone_number: app.phone_number,
        role: 'merchant',
      },
    });

    if (!authCreateErr && authCreateData?.user?.id) {
      userId = authCreateData.user.id;
      createdNewUser = true;
    } else {
      // Gracefully handle if user already exists
      const errMsg = authCreateErr?.message || '';
      console.log(`[approve-merchant] User creation notice for ${email}: ${errMsg}. Attempting lookup...`);

      // Search existing users in auth.admin.listUsers()
      const { data: userList, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      if (!listErr && userList?.users) {
        const existing = userList.users.find((u) => u.email?.toLowerCase() === email);
        if (existing) {
          userId = existing.id;
        }
      }

      // If still not found, check public.users
      if (!userId) {
        const { data: publicUser } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('phone', app.phone_number)
          .maybeSingle();

        if (publicUser?.id) {
          userId = publicUser.id;
        }
      }

      if (!userId) {
        throw new Error(`Failed to create or locate auth user for ${email}: ${authCreateErr?.message}`);
      }

      // Ensure existing user password is set to temporary password and metadata is synced
      const { error: updateAuthErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: app.full_name,
          phone_number: app.phone_number,
          role: 'merchant',
        },
      });

      if (updateAuthErr) {
        console.warn(`[approve-merchant] Notice updating password for existing user: ${updateAuthErr.message}`);
      }
    }

    // -------------------------------------------------------------------------
    // Step 3: Role Elevation in public.users (Stage 2)
    // -------------------------------------------------------------------------
    const { error: upsertUserErr } = await supabaseAdmin
      .from('users')
      .upsert({
        id: userId,
        role: 'merchant',
        name: app.full_name,
        phone: app.phone_number,
        updated_at: new Date().toISOString(),
      });

    if (upsertUserErr) {
      console.error('[approve-merchant] Error upserting public.users:', upsertUserErr);
      throw upsertUserErr;
    }

    // -------------------------------------------------------------------------
    // Step 4: Slug Allocation (Stage 3)
    // -------------------------------------------------------------------------
    const stallName = (body.stall_name || app.store_name || app.full_name || 'hawker-stall').trim();
    const baseSlug = (stallName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'stall';

    let candidateSlug = baseSlug;
    let suffix = 1;

    // Check collision in public.merchants
    while (true) {
      const { data: existingStall } = await supabaseAdmin
        .from('merchants')
        .select('id')
        .eq('slug', candidateSlug)
        .maybeSingle();

      if (!existingStall) break;
      suffix++;
      candidateSlug = `${baseSlug}-${suffix}`;
    }

    // -------------------------------------------------------------------------
    // Step 5: Provision Stall in public.merchants (Stage 4)
    // -------------------------------------------------------------------------
    // Check if merchant record already exists for this owner
    const { data: existingMerchant } = await supabaseAdmin
      .from('merchants')
      .select('id, slug')
      .eq('owner_id', userId)
      .maybeSingle();

    let merchantId = existingMerchant?.id;

    if (existingMerchant) {
      // Update existing merchant record with approved banking details
      const { error: updateMerchantErr } = await supabaseAdmin
        .from('merchants')
        .update({
          business_name: stallName,
          is_open: true,
          location: {
            bank_name: app.bank_name,
            bank_account_number: app.bank_account_number,
            mykad_number: app.mykad_number,
            menu_url: app.menu_url,
            store_name: app.store_name,
            address: 'Main Hawker Station',
            lat: 3.1390,
            lng: 101.6869,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingMerchant.id);

      if (updateMerchantErr) throw updateMerchantErr;
      candidateSlug = existingMerchant.slug;
    } else {
      // Insert brand new merchant record
      const { data: newMerchant, error: insertMerchantErr } = await supabaseAdmin
        .from('merchants')
        .insert({
          owner_id: userId,
          business_name: stallName,
          slug: candidateSlug,
          is_open: true,
          location: {
            bank_name: app.bank_name,
            bank_account_number: app.bank_account_number,
            mykad_number: app.mykad_number,
            menu_url: app.menu_url,
            store_name: app.store_name,
            address: 'Main Hawker Station',
            lat: 3.1390,
            lng: 101.6869,
          },
        })
        .select('id')
        .single();

      if (insertMerchantErr) throw insertMerchantErr;
      merchantId = newMerchant.id;
    }

    // -------------------------------------------------------------------------
    // Step 6: Finalize Application Status (Stage 5)
    // -------------------------------------------------------------------------
    const { error: finalizeErr } = await supabaseAdmin
      .from('merchant_applications')
      .update({ status: 'approved' })
      .eq('id', application_id);

    if (finalizeErr) throw finalizeErr;

    const successMessage = `Merchant Approved! Temporary password is ${tempPassword}`;

    return new Response(
      JSON.stringify({
        success: true,
        message: successMessage,
        application_id,
        merchant_id: merchantId,
        owner_id: userId,
        slug: candidateSlug,
        temporary_password: tempPassword,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Internal Server Error';
    console.error('[approve-merchant] Fatal Error:', err);
    return new Response(
      JSON.stringify({ error: 'PROVISIONING_FAILED', message: errorMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
