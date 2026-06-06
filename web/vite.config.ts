import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // SW désactivé pour l'instant : 'selfDestroying' génère un service worker qui se
    // désinstalle et purge le cache (corrige les pages blanches dues à un SW périmé).
    // On réactivera la PWA offline plus tard.
    VitePWA({ selfDestroying: true }),
  ],
});
