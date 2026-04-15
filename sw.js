// 🔧修正: バージョンを変えるだけでキャッシュ更新できるようにする
const CACHE_VERSION = 'routine-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// インストール：キャッシュに保存
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then(cache => {
      // 🔧修正: 個別にキャッシュしてエラーに強くする
      return Promise.allSettled(
        ASSETS.map(url => cache.add(url).catch(err => {
          console.warn('Cache failed for:', url, err);
        }))
      );
    })
  );
  self.skipWaiting();
});

// アクティベート：古いキャッシュ削除
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// 🔧修正: Network First + Cache Fallback（HTMLは常に最新を取得試行）
self.addEventListener('fetch', e => {
  const request = e.request;

  // ナビゲーションリクエスト（HTMLページ）はネットワーク優先
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then(response => {
          // 成功したらキャッシュを更新
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // その他のリソースはキャッシュ優先
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        // 🔧修正: 正常なレスポンスのみキャッシュ
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(request, clone));
        }
        return response;
      });
    }).catch(() => {
      // オフラインでキャッシュもない場合
      return new Response('オフラインです', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    })
  );
});

// プッシュ通知
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : { title: 'Daily Routine', body: 'ルーティンの時間です' };
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: './icon-192.png',
      badge: './icon-192.png'
    })
  );
});

// 🔧追加: 通知クリックでアプリを開く
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      // 既に開いているウィンドウがあればフォーカス
      for (const client of clientList) {
        if (client.url.includes('index.html') && 'focus' in client) {
          return client.focus();
        }
      }
      // なければ新しく開く
      if (clients.openWindow) {
        return clients.openWindow('./index.html');
      }
    })
  );
});