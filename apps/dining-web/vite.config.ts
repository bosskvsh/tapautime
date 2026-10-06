import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '../../dist/dining-web'),
    emptyOutDir: true,
  },
  server: {
    port: 3002, // Unique port for dining-web
  },
});
