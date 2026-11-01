// ======================================================================
// SERVICE WORKER - bntz Progressive Web App (PWA)
// ======================================================================

const CACHE_NAME = 'bntz-pwa-cache-v1';

// Danh mục tài nguyên tĩnh cốt lõi cần precache khi cài đặt
const PRECACHE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon-maskable-192.png',
    './icons/icon-maskable-512.png',
    './icons/icon.svg'
];

// 1. SỰ KIỆN INSTALL: Lưu cache tài nguyên tĩnh ban đầu & kích hoạt ngay lập tức
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(PRECACHE_ASSETS).catch((err) => {
                    console.warn('[SW] Precache asset warn:', err);
                });
            })
            .then(() => self.skipWaiting())
    );
});

// 2. SỰ KIỆN ACTIVATE: Dọn dẹp cache phiên bản cũ & claim clients ngay lập tức
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    if (name !== CACHE_NAME) {
                        return caches.delete(name);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. SỰ KIỆN FETCH: Xử lý request an toàn, tuyệt đối không can thiệp Firebase / API
self.addEventListener('fetch', (event) => {
    const request = event.request;

    // Chỉ xử lý các request GET; bỏ qua hoàn toàn POST, PUT, DELETE, OPTIONS...
    if (request.method !== 'GET') {
        return;
    }

    const url = new URL(request.url);

    // BỎ QUA HOÀN TOÀN: Firebase Cloud, Auth, Gemini API, CDN bên ngoài, WebSocket
    // Để trình duyệt fetch online trực tiếp, đảm bảo không nghẽn luồng đồng bộ cloud realtime
    if (
        url.protocol.startsWith('chrome-extension') ||
        url.hostname.includes('firebaseio.com') ||
        url.hostname.includes('googleapis.com') ||
        url.hostname.includes('google.com') ||
        url.hostname.includes('gstatic.com') ||
        url.hostname.includes('jsdelivr.net') ||
        url.pathname.includes('/.ws') ||
        url.protocol === 'ws:' ||
        url.protocol === 'wss:'
    ) {
        return;
    }

    // ĐỐI VỚI ĐIỀU HƯỚNG TRANG (HTML NAVIGATION):
    // Chiến lược Network-First: Ưu tiên tải bản mới nhất từ server; nếu mất mạng thì mở bản cached
    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const responseClone = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                    }
                    return networkResponse;
                })
                .catch(() => {
                    return caches.match(request).then((cachedResponse) => {
                        return cachedResponse || caches.match('./index.html') || caches.match('./');
                    });
                })
        );
        return;
    }

    // ĐỐI VỚI CÁC TÀI NGUYÊN NỘI BỘ (SAME-ORIGIN STATIC ASSETS: ICON, MANIFEST, v.v.):
    // Cache-First với Network Fallback & cập nhật nền
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
                fetch(request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse));
                    }
                }).catch(() => { /* Offline mode */ });
                return cachedResponse;
            }

            return fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
                }
                return networkResponse;
            });
        })
    );
});
