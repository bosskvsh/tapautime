const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, 'apps', 'customer-pwa', 'functions');
const dest = path.join(__dirname, 'functions');

if (fs.existsSync(src)) {
  fs.cpSync(src, dest, { recursive: true, force: true });
}
