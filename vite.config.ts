import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Durante el desarrollo /__sync se reenvía al servidor de sincronización (npm run dev:server)
const syncProxy = {
  '/__sync': { target: process.env.SYNC_PROXY_TARGET ?? 'http://localhost:8787' },
};

export default defineConfig({
  server: { host: true, proxy: syncProxy },
  preview: { host: true, proxy: syncProxy },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      includeAssets: ['icons/*.png', 'icons/*.svg'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/__sync/],
      },
    }),
  ],
});
