import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // App instalável que abre sem internet: o service worker guarda o app; os dados vêm do IndexedDB.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Mesa — RPG ao vivo',
        short_name: 'Mesa',
        description: 'Ficha, dados e combate para jogar RPG presencial.',
        lang: 'pt-BR',
        start_url: '/',
        display: 'standalone',
        background_color: '#16130f',
        theme_color: '#16130f',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        navigateFallback: '/index.html',
        // A API do Supabase nunca é servida do cache do service worker (dados sensíveis e ao vivo).
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//, /^\/functions\//, /^\/storage\//],
      },
    }),
  ],
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
});
