import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Retire l'attribut crossorigin des balises générées (inutile en même origine).
// order:'post' pour passer APRÈS l'injection des balises par Vite.
function stripCrossorigin(): Plugin {
  return {
    name: 'strip-crossorigin',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(/\s+crossorigin/g, '');
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), stripCrossorigin()],
  build: { target: 'es2019' },
});
