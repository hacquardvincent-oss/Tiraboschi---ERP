// Service worker Tiraboschi — installabilité PWA + repli hors-ligne de l'app.
// Principe POS : on NE met JAMAIS l'API en cache (données fraîches). L'app (index.html,
// tout inliné) est servie réseau-d'abord (fraîche en ligne) avec repli cache hors-ligne.
const CACHE = 'tiraboschi-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // tiers (ex. Stripe) : laisser passer
  if (url.pathname.startsWith('/api/')) return; // API : jamais de cache

  // Navigation (coquille de l'app) : réseau d'abord, repli cache hors-ligne.
  if (req.mode === 'navigate') {
    e.respondWith(
      (async () => {
        try {
          const net = await fetch(req);
          const c = await caches.open(CACHE);
          c.put('/', net.clone());
          return net;
        } catch {
          const c = await caches.open(CACHE);
          return (await c.match('/')) || (await c.match(req)) || Response.error();
        }
      })(),
    );
    return;
  }

  // Autres GET même origine (icônes, manifest) : cache d'abord, sinon réseau.
  e.respondWith(
    (async () => {
      const c = await caches.open(CACHE);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const net = await fetch(req);
        if (net.ok) c.put(req, net.clone());
        return net;
      } catch {
        return hit || Response.error();
      }
    })(),
  );
});
