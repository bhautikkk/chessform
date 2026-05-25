const CACHE_NAME = 'chess-review-v166';

self.addEventListener('install', (event) => {
    self.skipWaiting(); // Force the waiting service worker to become the active service worker
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([
                './',
                './index.html',
                './style.css?v=166',
                './script.js?v=166',
                './openings.js?v=166',
                './manifest.json',
                './app-logo.png',
                './icons/bullet.png',
                './icons/blitz.png',
                './stockfish-18-lite-single.js',
                './stockfish-18-lite-single.wasm',
                './chessboard-local.js?v=137',
                './sounds/move-self.mp3',
                './sounds/capture.mp3',
                './sounds/move-check.mp3',
                './sounds/castle.mp3',
                './sounds/promote.mp3',
                './sounds/game-end.mp3',
                'https://code.jquery.com/jquery-3.6.0.min.js',
                'https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js'
            ]);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Take control of all open pages immediately
    );
});

self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request, { ignoreSearch: true }).then((response) => {
            if (response) {
                return response; // Return cached version immediately
            }
            
            const fetchRequest = event.request.clone();
            
            return fetch(fetchRequest).then((response) => {
                // Don't cache invalid responses
                if (!response || response.status !== 200 || (response.type !== 'basic' && response.type !== 'cors')) {
                    return response;
                }
                
                // Dynamically cache chesspieces or fonts
                if (event.request.url.includes('chesspieces') || event.request.url.includes('fonts.')) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                
                return response;
            }).catch(() => {
                // If offline and request fails, it just fails gracefully
                // You could return an offline fallback image here if needed
            });
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});
