import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

async function inspect() {
  console.log('Fetching recent orders from Supabase...');
  const res = await fetch(`${url}/rest/v1/orders?select=id,display_id,customer_id,customer_name,customer_phone,created_at,users(name,phone)&order=created_at.desc&limit=5`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });

  if (!res.ok) {
    console.error('Fetch failed:', res.status, res.statusText, await res.text());
    return;
  }

  const orders = await res.json();
  console.log(`Found ${orders.length} orders:`);
  console.log(JSON.stringify(orders, null, 2));
}

inspect();
