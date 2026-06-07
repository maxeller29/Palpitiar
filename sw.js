/* ============================================================
   Lotoia · Service Worker v2
   Estratégia: Network First para HTML (sempre atualizado)
               Cache First para JSON históricos (grandes/estáticos)
               Versão incrementada = força atualização automática
   ============================================================ */

const CACHE_VERSION = 'lotoia-v2';
const CACHE_DATA    = 'lotoia-data-v2';

const HTML_FILES = [
  '/',
  '/index.html',
  '/mega-sena.html',
  '/lotofacil.html',
  '/quina.html',
  '/admin.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/lotoia-db.js',
  '/sw.js',
];

const DATA_FILES = [
  '/mega-sena-historico.json',
  '/lotofacil-historico.json',
  '/quina-historico.json',
];

// ===== INSTALL =====
self.addEventListener('install', event => {
  // Força ativação imediata sem esperar tabs antigas fecharem
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(HTML_FILES))
  );
});

// ===== ACTIVATE — limpa caches antigos e assume controle imediato =====
self.addEventListener('activate', event => {
  event.waitUntil(
    Promise.all([
      // Remove TODOS os caches antigos
      caches.keys().then(keys =>
        Promise.all(
          keys
            .filter(k => k !== CACHE_VERSION && k !== CACHE_DATA)
            .map(k => {
              console.log('[SW] Removendo cache antigo:', k);
              return caches.delete(k);
            })
        )
      ),
      // Assume controle de todas as tabs imediatamente
      self.clients.claim()
    ])
  );
});

// ===== FETCH =====
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // API da Caixa → sempre da rede, sem cache
  if (url.hostname.includes('caixa.gov.br') ||
      url.hostname.includes('supabase.co')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // JSONs históricos → Cache First (raramente mudam, são grandes)
  if (DATA_FILES.some(f => url.pathname === f)) {
    event.respondWith(cacheFirstData(event.request));
    return;
  }

  // HTML, JS, CSS → Network First (sempre serve a versão mais recente)
  event.respondWith(networkFirstHTML(event.request));
});

// Network First: tenta rede, fallback para cache
async function networkFirstHTML(request) {
  try {
    const response = await fetch(request, { cache: 'no-cache' });
    if (response.ok) {
      const cache = await caches.open(CACHE_VERSION);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fallback para index se navegação falhar offline
    if (request.mode === 'navigate') {
      return caches.match('/index.html');
    }
    return new Response('Offline', { status: 503 });
  }
}

// Cache First: serve do cache, atualiza em background
async function cacheFirstData(request) {
  const cached = await caches.match(request);
  if (cached) {
    // Atualiza em background sem bloquear
    fetch(request).then(response => {
      if (response.ok) {
        caches.open(CACHE_DATA).then(c => c.put(request, response));
      }
    }).catch(() => {});
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_DATA);
    cache.put(request, response.clone());
  }
  return response;
}

// Recebe mensagem para pular waiting e ativar imediatamente
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
