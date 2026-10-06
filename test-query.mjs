import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: 'apps/merchant-web/.env.local' });
dotenv.config({ path: 'apps/merchant-web/.env' });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function run() {
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*, menu_items(name)), users(name, phone), master_transactions(receipt_url, payment_method), order_events(event_type)')
    .limit(1);
  console.log('Error:', error);
  console.log('Data:', JSON.stringify(data, null, 2));
}
run();
