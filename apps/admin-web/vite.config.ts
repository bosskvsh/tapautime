import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '../../dist/admin-web'),
    emptyOutDir: true,
  },
  server: {
    port: 3003,
  },
});
