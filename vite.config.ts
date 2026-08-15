import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

const JOUR = 60 * 60 * 24

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],

      /*
       * Volontairement désactivé en développement. Un service worker de dev
       * survit à l'arrêt du serveur et continue de servir son index.html sur
       * l'origine : c'est exactement ce qui parasite le port 5173 depuis
       * d'autres projets du dossier. On ne reproduit pas le piège ici.
       */
      devOptions: { enabled: false },

      manifest: {
        name: 'Pokédex',
        short_name: 'Pokédex',
        description:
          'Les 1025 espèces, leurs stats, types, évolutions et formes chromatiques.',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#080a12',
        theme_color: '#080a12',
        categories: ['education', 'entertainment', 'games'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            // Android recadre l'icône selon la forme du lanceur : la variante
            // maskable garde le motif dans les 80 % centraux pour survivre au
            // rognage en cercle comme en losange.
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        // Seule la coquille applicative est précachée (~530 Ko). Les sprites
        // représentent 64 Mo : ils sont mis en cache à l'usage, jamais d'avance.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,

        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 20, maxAgeSeconds: JOUR * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Illustrations et sprites animés. Le CDN ne renvoie qu'un
            // `max-age=300`, donc sans ce cache tout serait rechargé toutes
            // les cinq minutes.
            urlPattern: /^https:\/\/raw\.githubusercontent\.com\/.*\.(png|gif)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pokemon-sprites',
              expiration: {
                // De quoi couvrir le dex entier, illustrations et sprites
                // animés confondus : environ 164 Mo, soit 3 % d'un quota
                // d'origine typique. `purgeOnQuotaError` reste le filet sur
                // un appareil à l'espace contraint.
                maxEntries: 2500,
                maxAgeSeconds: JOUR * 30,
                purgeOnQuotaError: true,
              },
              // Les images sont servies sans CORS : la réponse est opaque et
              // porte le statut 0. L'omettre reviendrait à ne rien cacher.
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/raw\.githubusercontent\.com\/.*\.ogg$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pokemon-cries',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: JOUR * 30,
                purgeOnQuotaError: true,
              },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    // Port dédié plutôt que le 5173 par défaut : d'autres projets du
    // dossier y enregistrent un service worker (vite-plugin-pwa), et
    // celui-ci survit à l'arrêt de leur serveur. Il continue alors de
    // servir leur index.html sur cette origine, ce qui provoque des
    // requêtes fantômes vers leurs propres feuilles de style.
    port: 5180,
    strictPort: true,
  },
  preview: {
    // Le build de production se sert ailleurs que le dev : les deux peuvent
    // tourner en parallèle, et c'est le seul mode où le service worker est
    // actif, donc le seul où la PWA est réellement vérifiable.
    port: 4173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
