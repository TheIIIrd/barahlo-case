/* Сервис-воркер: игра работает офлайн и ставится как приложение.

   Все файлы игры кэшируются разом при установке, а отдаются только из этого кэша. Так страница
   никогда не смешивает файлы разных версий. Новая версия приходит вместе с новым sw.js:
   при деплое GitHub Actions дописывает к CACHE хэш коммита, браузер видит изменённый sw.js,
   ставит новый кэш целиком и удаляет старый.

   Новый файл в styles/ или scripts/ нужно добавить и в index.html, и в CORE ниже —
   tools/check_site.py (он же запускается при деплое) проверит, что ничего не забыто. */
const CACHE = 'junkcase-v35';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png',
  './apple-touch-icon.png',
  './styles/base.css',
  './styles/header.css',
  './styles/feed.css',
  './styles/tabs.css',
  './styles/cases.css',
  './styles/arena.css',
  './styles/panel.css',
  './styles/contract.css',
  './styles/upgrade.css',
  './styles/crash.css',
  './styles/cards.css',
  './styles/inventory.css',
  './styles/workshop.css',
  './styles/museum.css',
  './styles/restore.css',
  './styles/picker.css',
  './styles/toasts.css',
  './styles/modals.css',
  './styles/contrast.css',
  './styles/responsive.css',
  './scripts/data/cases.js',
  './scripts/data/recipes.js',
  './scripts/data/nicks.js',
  './scripts/data/cards.js',
  './scripts/core/config.js',
  './scripts/core/utils.js',
  './scripts/core/catalog.js',
  './scripts/core/state.js',
  './scripts/core/sound.js',
  './scripts/core/effects.js',
  './scripts/core/items.js',
  './scripts/core/levels.js',
  './scripts/core/wallet.js',
  './scripts/core/nav.js',
  './scripts/core/toend.js',
  './scripts/cases/grid.js',
  './scripts/cases/roulette.js',
  './scripts/cases/drops.js',
  './scripts/inventory/picker.js',
  './scripts/inventory/items.js',
  './scripts/inventory/museum.js',
  './scripts/inventory/workshop.js',
  './scripts/inventory/restore.js',
  './scripts/inventory/stats.js',
  './scripts/inventory/saves.js',
  './scripts/modes/contract.js',
  './scripts/modes/upgrade.js',
  './scripts/modes/crash.js',
  './scripts/cards/catalog.js',
  './scripts/cards/forge.js',
  './scripts/cards/collection.js',
  './scripts/ambient/granny.js',
  './scripts/ambient/feed.js',
  './scripts/main.js',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' — мимо HTTP-кэша браузера, иначе можно собрать кэш из свежих и старых файлов.
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('junkcase-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Сначала кэш — только СВОЕЙ версии (caches.match без open искал бы во всех кэшах сразу и мог бы
// на время обновления смешать файлы двух версий). Чего в нём нет (шрифты Google), берём из сети и докладываем.
// Страница игры с «?utm=…» и т. п. — та же страница: отдаём её из кэша, иначе свежий index.html из сети
// смешался бы со старыми скриптами из кэша. Адреса с «?…» в кэш не кладём — он рос бы без конца.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  const page = e.request.mode === 'navigate' && url.origin === location.origin && /\/(index\.html)?$/.test(url.pathname);
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = (await c.match(e.request, { ignoreSearch: page })) || (page ? await c.match('./') : undefined);
    if (hit) return hit;
    try {
      const r = await fetch(e.request);
      if (r && (r.ok || r.type === 'opaque') && !page && (url.origin !== location.origin || !url.search)) c.put(e.request, r.clone());
      return r;
    } catch (err) {
      return (page && (await c.match('./'))) || Response.error();
    }
  }));
});
