const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

const server = http.createServer((req, res) => {
  let [reqPath, queryString] = req.url.split('?');
  const params = new URLSearchParams(queryString || '');
  const host = (req.headers.host || '').toLowerCase();

  // Handle api.php endpoint locally (matching Hostinger PHP api)
  if (reqPath === '/api.php') {
    const action = params.get('action') || '';
    const merchantId = (params.get('merchant') || '').replace(/[^a-zA-Z0-9_-]/g, '');
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      try { fs.mkdirSync(dataDir, { recursive: true }); } catch (e) {}
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (action === 'save_customization' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        if (merchantId) {
          try {
            fs.writeFileSync(path.join(dataDir, `customization_${merchantId}.json`), body);
          } catch (e) {}
        }
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'success' }));
      });
      return;
    }

    if (action === 'get_customization') {
      let f = path.join(dataDir, `customization_${merchantId}.json`);
      if (merchantId && fs.existsSync(f)) {
        res.writeHead(200);
        res.end(fs.readFileSync(f, 'utf8'));
      } else {
        res.writeHead(200);
        res.end(JSON.stringify(null));
      }
      return;
    }

    if (action === 'save_menu' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          fs.writeFileSync(path.join(dataDir, `menu_${merchantId}.json`), body);
        } catch (e) {}
        res.writeHead(200);
        res.end(JSON.stringify({ status: 'success' }));
      });
      return;
    }

    if (action === 'get_menu') {
      const f = path.join(dataDir, `menu_${merchantId}.json`);
      if (fs.existsSync(f)) {
        res.writeHead(200);
        res.end(fs.readFileSync(f, 'utf8'));
      } else {
        res.writeHead(200);
        res.end(JSON.stringify(null));
      }
      return;
    }

    res.writeHead(200);
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // Subdomain routing (kds.tapautime.my, app.tapautime.my)
  if (host.startsWith('kds.') || host.includes('kds.localhost')) {
    if (reqPath === '/' || reqPath === '') {
      reqPath = '/merchant_login.html';
    } else if (reqPath === '/portal' || reqPath === '/dashboard' || reqPath === '/merchant' || reqPath === '/kds') {
      reqPath = '/merchant.html';
    }
  } else if (host.startsWith('app.') || host.includes('app.localhost')) {
    if (reqPath === '/' || reqPath === '') {
      reqPath = '/order.html';
    }
  } else {
    // Main domain (tapautime.my, www.tapautime.my, localhost)
    if (reqPath === '/' || reqPath === '') {
      reqPath = fs.existsSync(path.join(__dirname, 'index.html')) ? '/index.html' : '/order.html';
    } else if (reqPath === '/login' || reqPath === '/merchant-login' || reqPath === '/login/') {
      reqPath = '/merchant_login.html';
    } else if (reqPath === '/order' || reqPath === '/order/' || reqPath === '/ordering') {
      reqPath = '/order.html';
    } else if (reqPath === '/merchant' || reqPath === '/merchant/' || reqPath === '/kds') {
      reqPath = '/merchant.html';
    } else if (reqPath === '/tapau_time_merchant' || reqPath === '/tapau_time_merchant/') {
      reqPath = '/tapau_time_merchant/index.html';
    } else if (reqPath === '/tapau-logo.png') {
      reqPath = '/icons/tapau-logo.png';
    }
  }

  let filePath = path.join(__dirname, reqPath);

  fs.stat(filePath, (err, stats) => {
    if (err) {
      // Try appending .html if extension is missing
      if (!path.extname(filePath)) {
        const htmlPath = filePath + '.html';
        if (fs.existsSync(htmlPath)) {
          filePath = htmlPath;
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
          return;
        }
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
    } else if (stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Tapau Time running at http://localhost:${PORT}`);
  console.log(`Merchant Portal available at http://localhost:${PORT}/merchant`);
});

