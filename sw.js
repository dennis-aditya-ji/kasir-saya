// ============================================================
// SERVICE WORKER - KASIR PWA
// ============================================================
// CATATAN: Service worker ini SENGAJA dibuat minimal.
// Aplikasi ini didesain ONLINE-ONLY (tidak ada cache data offline)
// untuk menghindari konflik sinkronisasi dengan Google Sheets.
// Fungsi service worker di sini HANYA untuk memenuhi syarat teknis
// agar PWA bisa di-install ke homescreen Android/iOS.
//
// PENTING: strategi di sini adalah "selalu ambil versi terbaru dari
// internet dulu" untuk SEMUA file (HTML/CSS/JS), bukan cache-first.
// Ini memastikan setiap kali Anda update app.js/style.css di GitHub,
// pengguna akan langsung mendapat versi terbaru tanpa perlu uninstall
// aplikasi atau menunggu cache kedaluwarsa.
// ============================================================

const CACHE_NAME = 'kasir-shell-fallback';

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
    ).then(() => self.clients.claim())
  );
});

// Network First MURNI untuk file shell: selalu coba ambil dari internet dulu.
// Cache hanya dipakai jika benar-benar tidak ada koneksi sama sekali.
// Setiap respons baru dari network akan menimpa cache lama secara otomatis,
// jadi cache selalu mengikuti versi terbaru tanpa perlu ganti nama cache manual.
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Jangan pernah intercept request ke Apps Script (data harus selalu live)
  if (url.includes('script.google.com')) {
    return;
  }

  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then((response) => {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
