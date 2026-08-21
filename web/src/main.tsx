import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';

function showFatal(message: string): void {
  const el = document.getElementById('root');
  if (el) {
    el.innerHTML =
      '<pre style="color:#b3261e;white-space:pre-wrap;word-break:break-word;padding:16px;font:13px monospace;background:#fff">Erreur app :\n' +
      message +
      '</pre>';
  }
}

// Capte les erreurs hors React (modules, promesses) et les affiche.
window.addEventListener('error', (e) =>
  showFatal((e.message || 'erreur') + '\n' + (e.error?.stack ?? '')),
);
window.addEventListener('unhandledrejection', (e) =>
  showFatal('Promise rejetée : ' + (e.reason?.message ?? String(e.reason))),
);

try {
  const root = document.getElementById('root');
  if (!root) throw new Error('#root introuvable dans le HTML');
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
} catch (e) {
  showFatal((e as Error).message + '\n' + ((e as Error).stack ?? ''));
}
