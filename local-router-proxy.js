require('dotenv').config();
const http = require('http');
const httpProxy = require('http-proxy');
const { createClient } = require('@supabase/supabase-js');

// To use this, you must run `npm install http-proxy dotenv @supabase/supabase-js`
// and ensure your .env file has SUPABASE_URL and SUPABASE_ANON_KEY

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in environment variables.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const VITE_PORT = 5173; // The port your Vite app runs on (customer-pwa)
const PROXY_PORT = 3000; // The port this proxy listens on

const proxy = httpProxy.createProxyServer({});

proxy.on('error', (err, req, res) => {
  res.writeHead(500, { 'Content-Type': 'text/plain' });
  res.end('Proxy error: ' + err.message);
});

const server = http.createServer(async (req, res) => {
  const host = (req.headers.host || '').toLowerCase();
  let [reqPath] = req.url.split('?');

  // Ignore static assets for edge logic to avoid excessive DB calls
  if (reqPath.match(/\.(js|css|ico|png|jpg|jpeg|svg|webp|woff2?)$/)) {
    return proxy.web(req, res, { target: `http://localhost:${VITE_PORT}` });
  }

  try {
    // 1. Subdomain Request Logic (e.g. merchant-slug.localhost:3000)
    // Assuming host is something like "merchant-slug.localhost:3000"
    if (host !== `app.localhost:${PROXY_PORT}` && host !== `localhost:${PROXY_PORT}`) {
      const subdomain = host.split('.')[0];
      
      const { data: merchant } = await supabase
        .from('merchants')
        .select('slug, has_tapaulinkpro')
        .eq('slug', subdomain)
        .single();

      if (merchant) {
        if (merchant.has_tapaulinkpro) {
          // PRO Tier: Allow rendering. 
          // Rewrite the URL so the underlying Vite SPA sees it as /merchant-slug
          // so the client-side router knows which merchant to load.
          req.url = `/${subdomain}${req.url === '/' ? '' : req.url}`;
          return proxy.web(req, res, { target: `http://localhost:${VITE_PORT}` });
        } else {
          // Not PRO: Redirect to free tier URL
          res.writeHead(301, { Location: `http://app.localhost:${PROXY_PORT}/${subdomain}` });
          return res.end();
        }
      }
    }

    // 2. Path Request Logic (e.g. app.localhost:3000/merchant-slug)
    if (host === `app.localhost:${PROXY_PORT}`) {
      const segments = reqPath.split('/').filter(Boolean);
      const possibleSlug = segments[0];

      if (possibleSlug) {
        const { data: merchant } = await supabase
          .from('merchants')
          .select('slug, has_tapaulinkpro')
          .eq('slug', possibleSlug)
          .single();

        if (merchant) {
          if (merchant.has_tapaulinkpro) {
            // PRO Tier: Redirect to premium subdomain
            res.writeHead(301, { Location: `http://${possibleSlug}.localhost:${PROXY_PORT}/` });
            return res.end();
          } else {
            // Not PRO: Allow normal path rendering
            return proxy.web(req, res, { target: `http://localhost:${VITE_PORT}` });
          }
        }
      }
    }

    // 3. Root/App Routing
    // Pass everything else through to Vite unchanged
    return proxy.web(req, res, { target: `http://localhost:${VITE_PORT}` });

  } catch (error) {
    console.error('Edge Routing Error:', error);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
});

server.listen(PROXY_PORT, () => {
  console.log(`TapauLinkPRO Edge Proxy running on http://localhost:${PROXY_PORT}`);
  console.log(`Make sure Vite (customer-pwa) is running on port ${VITE_PORT}`);
  console.log(`Test PRO: http://[merchant-slug].localhost:3000`);
  console.log(`Test Free: http://app.localhost:3000/[merchant-slug]`);
});
