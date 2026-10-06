import fs from 'fs';
import path from 'path';

const root = 'C:/Users/cleve/OneDrive/Desktop/tapau time';

const files = [
  root + '/merchant_login.html',
  root + '/scratch/landing_deploy/merchant_login.html',
  root + '/apps/merchant-web/src/screens/AuthScreen.tsx',
];

const bndFile = root + '/dist/merchant-web/assets/index-jbnRFOhn.js';

function findHits(text, pat) {
  const hits = [];
  let idx = text.indexOf(pat);
  while (idx !== -1) {
    hits.push(idx);
    idx = text.indexOf(pat, idx + pat.length);
  }
  return hits;
}

const terms = [
  'Create Merchant Account',
  'Create Account',
  'Continue with Google',
  'Sign In (Existing)',
  'New Merchant Sign Up',
  'tab-btn-signin',
  'tab-btn-signup',
  'google-btn',
  'doGoogleMerchant',
  'switchAuthMode',
  'signInWithOAuth',
  'supabase.auth.signUp',
  'toggle-auth-prompt',
  'store-name-group',
  'auth-badge',
];

let anyFound = false;

console.log('=== SOURCE FILES ===');
for (const f of files) {
  console.log('\nFILE:', f);
  const h = fs.readFileSync(f, 'utf8');
  for (const t of terms) {
    const hits = findHits(h, t);
    if (hits.length) {
      console.log(`  FOUND "${t}": ${hits.length} hit(s)`);
      anyFound = true;
    }
  }
}

console.log('\n=== BUILD BUNDLE ===');
const b = fs.readFileSync(bndFile, 'utf8');
for (const t of terms) {
  const hits = findHits(b, t);
  if (hits.length) {
    console.log(`  FOUND "${t}": ${hits.length} hit(s) — these are likely from the Supabase SDK`);
    const first = hits[0];
    console.log('   context: ' + b.slice(Math.max(0, first - 80), first + 80));
    console.log('   last 40: ' + b.slice(first, first + 40));
    anyFound = true;
  }
}

const bLower = b.toLowerCase();
console.log('\n=== BUNDLE CASE-INSENSITIVE ===');
console.log('create merchant account:', bLower.indexOf('create merchant account'));
console.log('continue with google:', bLower.indexOf('continue with google'));
console.log('signup (word):', bLower.indexOf('signup'));
console.log('oauth:', bLower.indexOf('oauth'));

console.log('\n=== RESULT ===');
if (!anyFound) console.log('STATUS: CLEAN — no merchant create-account / google strings found');
else console.log('STATUS: NEED REVIEW — some strings remain (see above)');
