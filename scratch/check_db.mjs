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

// The fix: add a DEFAULT to display_id so it auto-generates for direct inserts
// We must verify: does orders table currently allow nulls or not?
async function checkDisplayId() {
  const res = await fetch(`${url}/rest/v1/orders?select=display_id&limit=3`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });
  const data = await res.json();
  console.log('Sample orders display_id values:', data);
}

checkDisplayId();
