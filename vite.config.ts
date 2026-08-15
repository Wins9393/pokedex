import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Port dédié plutôt que le 5173 par défaut : d'autres projets du
    // dossier y enregistrent un service worker (vite-plugin-pwa), et
    // celui-ci survit à l'arrêt de leur serveur. Il continue alors de
    // servir leur index.html sur cette origine, ce qui provoque des
    // requêtes fantômes vers leurs propres feuilles de style.
    port: 5180,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
