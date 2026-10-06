import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: 'auto',
      includeAssets: ['favicon.ico', 'icons/*.png', 'icons/*.svg', '.htaccess', 'sounds/*.mp3', 'tapautime.mp3'],
      manifest: {
        name: 'TapauTime KDS | Kitchen Display System',
        short_name: 'Tapau KDS',
        description: 'Real-time kitchen order management, stall heartbeat, and anti-fraud verification.',
        theme_color: '#0C0A09',
        background_color: '#0C0A09',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['business', 'food', 'productivity'],
        icons: [
          {
            src: '/icons/icon-192-v3.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-512-v3.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icons/icon-maskable-512-v3.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,mp3}'],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Bypass live Supabase REST, Auth, Functions, and Realtime endpoints
            urlPattern: ({ url }) => url.hostname.includes('supabase.co'),
            handler: 'NetworkOnly'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@tapautime/shared-ui': path.resolve(__dirname, '../../packages/shared-ui/src/index.ts'),
      '@tapautime/shared-ui/*': path.resolve(__dirname, '../../packages/shared-ui/src/*')
    }
  },
  build: {
    outDir: path.resolve(__dirname, '../../dist/merchant-web'),
    emptyOutDir: true,
    sourcemap: false
  },
  server: {
    port: 3001,
    host: true
  }
});
