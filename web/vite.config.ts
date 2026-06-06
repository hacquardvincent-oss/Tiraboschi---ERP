import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// PWA retirée pour l'instant (le service worker provoquait des pages blanches par cache périmé).
// On réintroduira l'offline proprement plus tard, une fois l'app stable.
export default defineConfig({
  plugins: [react()],
});
