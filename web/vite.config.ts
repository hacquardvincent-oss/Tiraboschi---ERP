import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Tout le JS/CSS est inliné dans index.html (un seul fichier servi).
// Contourne le blocage du chargement de module externe constaté en prod
// (les scripts inline, eux, s'exécutent — le diagnostic le prouve).
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: { target: 'es2019' },
});
