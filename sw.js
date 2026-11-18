/* SPADAKes service worker: app shell offline, API selalu langsung ke jaringan. */
var VERSION = 'spadakes-v1.5.2';
var SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/config.js', 'manifest.webmanifest',
  'icons/logo.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION && k.indexOf('spadakes-') === 0; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (e) { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

self.addEventListener('fetch', function (e) {
  var req = e.request, url = new URL(req.url);
  if (req.method !== 'GET') return;
  // API Apps Script: jangan pernah di-cache
  if (/script\.google(usercontent)?\.com$/.test(url.hostname)) return;
  // Google Fonts: stale-while-revalidate
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(VERSION + '-fonts').then(function (c) {
      return c.match(req).then(function (hit) {
        var net = fetch(req).then(function (r) { c.put(req, r.clone()); return r; }).catch(function () { return hit; });
        return hit || net;
      });
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // Navigasi: jaringan dulu, jatuh ke cache (agar update langsung terlihat)
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (r) { var cp = r.clone(); caches.open(VERSION).then(function (c) { c.put('index.html', cp); }); return r; })
      .catch(function () { return caches.match('index.html').then(function (r) { return r || caches.match('./'); }); }));
    return;
  }
  // Aset statis: cache dulu, perbarui di latar belakang
  e.respondWith(caches.match(req).then(function (hit) {
    var net = fetch(req).then(function (r) { if (r && r.ok) { var cp = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, cp); }); } return r; }).catch(function () { return hit; });
    return hit || net;
  }));
});
