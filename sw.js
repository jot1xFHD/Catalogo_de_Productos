/* ============================================================
   Service Worker: funcionamiento sin conexión
   - App (HTML/CSS/JS): se guarda al instalar.
   - Catálogo (data/catalogo.json): primero red, si no hay, copia guardada.
   - Imágenes y videos: primero caché, se guardan a medida que se ven.
   - CSS/JS: se sirven desde la caché y se actualizan en segundo plano
     (los cambios se ven en la siguiente visita).
   Si haces cambios grandes a la app (html/css/js), sube VERSION para
   forzar que todos los dispositivos descarguen la nueva versión.
   ============================================================ */
const VERSION = 'v6';
const CACHE_APP = 'catalogo-app-' + VERSION;
const CACHE_DATOS = 'catalogo-datos-v1';
const CACHE_MEDIA = 'catalogo-media-v1';   // debe coincidir con js/app.js

const ARCHIVOS_APP = [
  './',
  'index.html',
  'admin.html',
  'manifest.webmanifest',
  'css/estilos.css',
  'css/admin.css',
  'js/config.js',
  'js/datos.js',
  'js/app.js',
  'js/admin.js',
  'js/zip.js',
  'js/qr.js',
  'js/github.js',
  'generar-clave.html',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png'
];

const EXT_IMAGEN = /\.(png|jpe?g|webp|gif|svg|avif)$/i;
const EXT_VIDEO = /\.(mp4|webm|ogv|mov|m4v)$/i;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_APP)
      .then(c => c.addAll(ARCHIVOS_APP.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  const vigentes = [CACHE_APP, CACHE_DATOS, CACHE_MEDIA];
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('catalogo-') && !vigentes.includes(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const mismoOrigen = url.origin === self.location.origin;

  // Páginas
  if (req.mode === 'navigate') {
    e.respondWith(redPrimero(req, CACHE_APP, true));
    return;
  }
  // Datos del catálogo y configuración (para que un cambio de contraseña
  // o de número aplique de inmediato)
  if (mismoOrigen && (url.pathname.endsWith('/data/catalogo.json') || url.pathname.endsWith('/js/config.js'))) {
    e.respondWith(redPrimero(req, CACHE_DATOS, false, true));
    return;
  }
  // Videos
  if (req.destination === 'video' || EXT_VIDEO.test(url.pathname)) {
    e.respondWith(video(req));
    return;
  }
  // Imágenes (propias o externas)
  if (req.destination === 'image' || EXT_IMAGEN.test(url.pathname)) {
    e.respondWith(cachePrimero(req, CACHE_MEDIA));
    return;
  }
  // Resto de archivos propios (css, js, íconos): respuesta inmediata desde
  // la caché y actualización en segundo plano para la próxima visita.
  if (mismoOrigen) {
    e.respondWith(cacheYActualiza(req, e));
  }
});

async function cacheYActualiza(req, evento) {
  const cache = await caches.open(CACHE_APP);
  const guardado = await cache.match(req, { ignoreSearch: true });
  const red = fetch(req, { cache: 'no-cache' }).then(res => {
    if (res.ok) cache.put(clave(req), res.clone());
    return res;
  });
  if (guardado) {
    evento.waitUntil(red.catch(() => {}));
    return guardado;
  }
  try { return await red; }
  catch (err) { return new Response('', { status: 504 }); }
}

async function redPrimero(req, nombreCache, esPagina, ignorarCacheNavegador) {
  const cache = await caches.open(nombreCache);
  try {
    const res = await conTiempoLimite(fetch(req, ignorarCacheNavegador ? { cache: 'no-cache' } : undefined), 6000);
    // Datos: una sola copia aunque se pidan con ?v=... ; páginas: con su query (?preview)
    if (res.ok) cache.put(esPagina ? clave(req) : req.url.split('?')[0], res.clone());
    return res;
  } catch (err) {
    const guardado = await caches.match(clave(req), { ignoreSearch: true })
      || (esPagina && await caches.match(new URL(req.url).pathname.endsWith('admin.html') ? 'admin.html' : 'index.html'));
    if (guardado) return guardado;
    return new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function cachePrimero(req, nombreCache) {
  const guardado = await caches.match(clave(req));
  if (guardado) return guardado;
  try {
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') {
      const cache = await caches.open(nombreCache);
      cache.put(clave(req), res.clone());
    }
    return res;
  } catch (err) {
    return new Response('', { status: 504 });
  }
}

// Videos: si está guardado, se responde desde la caché (incluyendo peticiones
// por rangos, necesarias para adelantar / Safari). Si no, va a la red sin
// guardarlo (los videos se guardan desde el botón "Guardar video" o
// "Descargar catálogo" para no llenar el teléfono sin permiso).
async function video(req) {
  const guardado = await caches.match(clave(req));
  if (!guardado) {
    try { return await fetch(req); }
    catch (err) { return new Response('', { status: 504 }); }
  }
  const rango = req.headers.get('range');
  if (!rango || guardado.type === 'opaque') return guardado;

  const blob = await guardado.blob();
  const m = /bytes=(\d*)-(\d*)/.exec(rango) || [];
  let inicio, fin;
  if (m[1] === '' && m[2]) {               // bytes=-500 (últimos N bytes)
    inicio = Math.max(0, blob.size - Number(m[2]));
    fin = blob.size - 1;
  } else {
    inicio = Number(m[1] || 0);
    fin = m[2] ? Math.min(Number(m[2]), blob.size - 1) : blob.size - 1;
  }
  if (inicio >= blob.size) {
    return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${blob.size}` } });
  }
  const trozo = blob.slice(inicio, fin + 1);
  return new Response(trozo, {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': guardado.headers.get('Content-Type') || 'video/mp4',
      'Content-Range': `bytes ${inicio}-${fin}/${blob.size}`,
      'Content-Length': String(trozo.size),
      'Accept-Ranges': 'bytes'
    }
  });
}

// La clave de caché es la URL sin cabeceras (Range, etc.)
function clave(req) {
  return req.url;
}

function conTiempoLimite(promesa, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('tiempo agotado')), ms);
    promesa.then(r => { clearTimeout(t); resolve(r); }, e => { clearTimeout(t); reject(e); });
  });
}
