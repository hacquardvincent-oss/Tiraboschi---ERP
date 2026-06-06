import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Tiraboschi POS / ERP',
        short_name: 'Tiraboschi',
        theme_color: '#050505',
        background_color: '#050505',
        display: 'standalone',
        icons: [],
      },
    }),
  ],
});
