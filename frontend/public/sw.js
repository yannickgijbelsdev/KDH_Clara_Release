// Clara Service Worker — minimal, just enables PWA install prompt
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
