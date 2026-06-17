// ============================================================
// SERVICE WORKER - KASIR PWA
// ============================================================
// CATATAN: Service worker ini SENGAJA dibuat minimal.
// Aplikasi ini didesain ONLINE-ONLY (tidak ada cache data offline)
// untuk menghindari konflik sinkronisasi dengan Google Sheets.
// Fungsi service worker di sini HANYA untuk memenuhi syarat teknis
// agar PWA bisa di-install ke homescreen Android/iOS.
// ============================================================

const CACHE_NAME = 'kasir-shell-v1';

// Hanya cache "shell" statis (tampilan kosong), BUKAN data transaksi/produk.
const SHELL_FILES = [
  './index.html',
  './style.css',
  './app.js',
  './config.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Strategi: Network First untuk semua request.
// Jika offline, baru fallback ke shell cache (hanya tampilan, bukan data).
// Request ke API Google Apps Script TIDAK pernah di-cache.
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Jangan cache sama sekali request ke Apps Script (data harus selalu live)
  if (url.includes('script.google.com')) {
    return; // biarkan lewat langsung ke network, tanpa intercept
  }

  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
