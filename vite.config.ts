import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Durante el desarrollo la caja habla con AbarreAPI en el mismo origen: Vite reenvía la API, el canal en vivo
// (SignalR, con WebSocket), las fotos y /__sync/info (direcciones para el QR de vinculación).
// API_PROXY_TARGET (en .env o en el entorno): http://localhost:8787 con `dotnet run`, o la URL de la API en la nube.
const env = { ...loadEnv('development', process.cwd(), ''), ...process.env };
const target = env.API_PROXY_TARGET || 'http://localhost:8787';
// changeOrigin: una API en la nube (Railway) se elige por el nombre del dominio, no por la IP
const to = { target, changeOrigin: true, secure: true };
const syncProxy = {
  '/api': to,
  '/hubs': { ...to, ws: true },
  '/archivos': to,
  '/__sync': to,
};

export default defineConfig({
  server: { host: true, proxy: syncProxy },
  preview: { host: true, proxy: syncProxy },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      includeAssets: ['icons/*.png', 'icons/*.svg', 'brand/*.svg', 'favicon.svg', 'favicon.ico'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2,webmanifest}'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/__sync/, /^\/api\//, /^\/hubs\//, /^\/archivos\//],
      },
    }),
  ],
});
