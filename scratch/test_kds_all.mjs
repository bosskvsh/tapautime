import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envContent = fs.readFileSync(path.resolve(__dirname, '../apps/customer-pwa/.env'), 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const [key, ...rest] = line.split('=');
  if (key && rest.length > 0) {
    env[key.trim()] = rest.join('=').trim().replace(/['"]/g, '');
  }
});

const url = env['VITE_SUPABASE_URL'];
const key = env['VITE_SUPABASE_ANON_KEY'];
const supabase = createClient(url, key);

async function test() {
  const merchantId = '551150fe-ca68-4254-9e2a-3c4a8aedadea';
  
  const { data: ordersData, error: ordersErr } = await supabase
    .from('orders')
    .select('*, order_items(*), users(name, phone), master_transactions(receipt_url, payment_method)')
    .eq('merchant_id', merchantId)
    .or('payment_method.eq.cash,payment_status.eq.captured')
    .neq('status', 'pending_payment')
    .order('created_at', { ascending: false });

  console.log('ordersErr:', ordersErr);
  console.log('Total orders:', ordersData ? ordersData.length : 0);
  ordersData?.forEach((o, i) => {
    console.log(`[${i}] id: ${o.id}, display_id: ${o.display_id}, status: ${o.status}, cust_phone: "${o.customer_phone}", users: ${JSON.stringify(o.users)}`);
  });
}

test();
