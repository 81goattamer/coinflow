// オフラインで動くよう、アプリ本体をキャッシュする（COMMON-13）。ファイルを変えたら version.js の版を上げる
importScripts('./version.js');
const VERSION = `coinflow-v${self.APP_VERSION}`;
const FILES = [
  './',
  './index.html',
  './version.js',
  './manifest.webmanifest',
  './css/style.css',
  './icons/favicon.png',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './js/app.js',
  './js/app-store.js',
  './js/calc.js',
  './js/dates.js',
  './js/db.js',
  './js/forms.js',
  './js/i18n.js',
  './js/keyboard.js',
  './js/keypad.js',
  './js/ledger.js',
  './js/rows.js',
  './js/sheets.js',
  './js/store.js',
  './js/tx-detail.js',
  './js/ui.js',
  './js/views/analysis.js',
  './js/views/history.js',
  './js/views/home.js',
  './js/views/record.js',
  './js/views/settings.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// ネットワークを優先し、つながらないときはキャッシュを使う
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
