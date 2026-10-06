const { test, expect } = require('@playwright/test');

const SUPABASE_URL = 'https://iaqohdvdebgxtfbxijsw.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhcW9oZHZkZWJneHRmYnhpanN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNzkyNjIsImV4cCI6MjEwMjY1NTI2Mn0.DFFY_o-wlxonj1mlHsHe3M9_ELGWtTmaqgc1iGr33WE';

const HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

test.describe('TapauTime Architecture V2 Verification Suite', () => {
  test('V2-1: Verify menu_item_modifiers table and stock_quantity column exist', async ({ request }) => {
    // Check menu_items columns
    const menuRes = await request.get(
      `${SUPABASE_URL}/rest/v1/menu_items?select=id,name,stock_quantity,is_available&limit=1`,
      { headers: HEADERS }
    );
    expect(menuRes.status()).toBe(200);

    // Check menu_item_modifiers endpoint
    const modRes = await request.get(
      `${SUPABASE_URL}/rest/v1/menu_item_modifiers?select=id,modifier_group,option_name,additional_price&limit=1`,
      { headers: HEADERS }
    );
    expect(modRes.status()).toBe(200);
    console.log('✅ [V2-1] menu_item_modifiers and stock_quantity verified on REST API');
  });

  test('V2-2: Verify orders table has payment_status column', async ({ request }) => {
    const ordersRes = await request.get(
      `${SUPABASE_URL}/rest/v1/orders?select=id,payment_status,total_amount&limit=1`,
      { headers: HEADERS }
    );
    expect(ordersRes.status()).toBe(200);
    console.log('✅ [V2-2] payment_status verified on orders REST API');
  });

  test('V2-3: Verify order_items table has selected_modifiers column', async ({ request }) => {
    const itemsRes = await request.get(
      `${SUPABASE_URL}/rest/v1/order_items?select=id,quantity,selected_modifiers&limit=1`,
      { headers: HEADERS }
    );
    expect(itemsRes.status()).toBe(200);
    console.log('✅ [V2-3] selected_modifiers verified on order_items REST API');
  });
});
