interface Env {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_ANON_KEY: string;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, next } = context;
  const url = new URL(request.url);
  const hostname = url.hostname;

  // Ignore static assets to prevent infinite loops / unnecessary DB hits
  if (url.pathname.includes('.') || url.pathname.startsWith('/api') || url.pathname.startsWith('/assets')) {
    return next();
  }

  const RESERVED_SUBDOMAINS = new Set([
    'app',
    'kds',
    'merchant',
    'admin',
    'dinein',
    'dining',
    'www',
    'api',
    'mail',
    'cpanel',
    'webmail'
  ]);

  const subdomain = hostname.split('.')[0].toLowerCase();
  const isSubdomain = !RESERVED_SUBDOMAINS.has(subdomain) && hostname !== 'tapautime.my' && !hostname.includes('localhost') && !hostname.includes('.pages.dev');

  if (isSubdomain) {
    
    // Fetch merchant from Supabase REST API (Edge friendly)
    if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) {
      try {
        const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/merchants?slug=eq.${subdomain}&select=has_tapaulinkpro`, {
          headers: {
            apikey: env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`
          }
        });
        const merchants = (await res.json()) as any[];
        const merchant = merchants && merchants.length > 0 ? merchants[0] : null;

        if (merchant) {
          if (!merchant.has_tapaulinkpro) {
            // Not PRO: Redirect back to free tier
            return Response.redirect(`https://app.tapautime.my/${subdomain}${url.pathname === '/' ? '' : url.pathname}`, 301);
          }
        }
      } catch (err) {
        console.error('Middleware Supabase fetch error:', err);
      }
    }
  } else if (hostname === 'app.tapautime.my') {
    const pathSlug = url.pathname.split('/')[1];
    
    if (pathSlug && pathSlug !== 'assets' && pathSlug !== 'icons') {
      if (env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY) {
        try {
          const res = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/merchants?slug=eq.${pathSlug}&select=has_tapaulinkpro`, {
            headers: {
              apikey: env.VITE_SUPABASE_ANON_KEY,
              Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`
            }
          });
          const merchants = (await res.json()) as any[];
          const merchant = merchants && merchants.length > 0 ? merchants[0] : null;

          if (merchant?.has_tapaulinkpro) {
            // PRO: Redirect to their premium subdomain
            const newPath = url.pathname.replace(`/${pathSlug}`, '') || '/';
            return Response.redirect(`https://${pathSlug}.tapautime.my${newPath}`, 301);
          }
        } catch (err) {
          console.error('Middleware Supabase fetch error:', err);
        }
      }
    }
  }

  // Continue to serve static assets
  return next();
};
