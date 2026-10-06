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
  console.log('Querying public.users with anon key...');
  const res = await fetch(`${url}/rest/v1/users?select=id,name,phone,role&limit=10`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`
    }
  });

  console.log('Status:', res.status);
  const data = await res.json();
  console.log('Data:', data);
}

inspect();
