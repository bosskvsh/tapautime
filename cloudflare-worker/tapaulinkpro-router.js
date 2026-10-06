/**
 * TapauLinkPRO Wildcard Edge Router
 * Cloudflare Worker bound to route: *.tapautime.my/*
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const hostname = url.hostname.toLowerCase();

    // 1. Reserved hostnames & system subdomains that MUST NEVER be intercepted.
    // These requests pass directly through to their normal DNS origin (Hostinger / Pages / Mail).
    const RESERVED_HOSTS = new Set([
      'tapautime.my',
      'www.tapautime.my',
      'app.tapautime.my',
      'kds.tapautime.my',
      'merchant.tapautime.my',
      'admin.tapautime.my',
      'dinein.tapautime.my',
      'dining.tapautime.my',
      'api.tapautime.my',
      'mail.tapautime.my',
      'cpanel.tapautime.my',
      'webmail.tapautime.my'
    ]);

    if (RESERVED_HOSTS.has(hostname)) {
      return fetch(request);
    }

    // 2. Extract the subdomain (e.g., "los-bentos" from "los-bentos.tapautime.my")
    const subdomain = hostname.split('.')[0];

    // If static assets are requested on this subdomain, proxy to Cloudflare Pages
    if (url.pathname.match(/\.(js|css|ico|png|jpg|jpeg|svg|webp|woff2?|webmanifest|json)$/)) {
      const pagesUrl = new URL(request.url);
      pagesUrl.hostname = 'tapautime.pages.dev';
      return fetch(new Request(pagesUrl, request));
    }

    // 3. Query Supabase for merchant with this slug
    if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) {
      try {
        const res = await fetch(
          `${env.VITE_SUPABASE_URL}/rest/v1/merchants?slug=eq.${encodeURIComponent(subdomain)}&select=slug,has_tapaulinkpro`,
          {
            headers: {
              apikey: env.VITE_SUPABASE_ANON_KEY,
              Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`
            }
          }
        );

        if (res.ok) {
          const merchants = await res.json();
          const merchant = merchants && merchants.length > 0 ? merchants[0] : null;

          if (merchant) {
            if (merchant.has_tapaulinkpro) {
              // PRO Merchant: Proxy request seamlessly to Cloudflare Pages storefront
              const pagesUrl = new URL(request.url);
              pagesUrl.hostname = 'tapautime.pages.dev';
              return fetch(new Request(pagesUrl, request));
            } else {
              // Free-tier Merchant: Redirect to free tier path on app.tapautime.my
              const targetPath = url.pathname === '/' ? '' : url.pathname;
              return Response.redirect(`https://app.tapautime.my/${subdomain}${targetPath}${url.search}`, 302);
            }
          }
        }
      } catch (err) {
        console.error('Edge routing Supabase lookup error:', err);
      }
    }

    // 4. Subdomain is NOT a registered merchant in Supabase:
    // Do NOT redirect to app.tapautime.my. Instead, redirect cleanly to main landing page.
    return Response.redirect('https://tapautime.my', 302);
  }
};
