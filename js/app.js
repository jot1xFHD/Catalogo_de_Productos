/* ============================================================
   Catálogo público: listado, búsqueda, detalle, carrito → WhatsApp
   ============================================================ */
(function () {
  const { esc, sinAcentos, idYouTube, colorDe, iniciales } = Datos;
  const $ = (s, el = document) => el.querySelector(s);
  const PREVIEW = new URLSearchParams(location.search).has('preview');
  const POR_PAGINA = CONFIG.PRODUCTOS_POR_PAGINA || 24;
  const CACHE_MEDIA = 'catalogo-media-v1';   // debe coincidir con sw.js

  const estado = {
    catalogo: null,
    porId: new Map(),
    indice: new Map(),        // id -> texto normalizado para buscar
    filtrados: [],
    mostrados: 0,
    texto: '',
    categoria: '',
    carrito: leerCarrito()
  };

  // ---------------- Inicio ----------------
  document.addEventListener('DOMContentLoaded', iniciar);

  async function iniciar() {
    registrarSW();
    eventos();
    actualizarAvisoOffline();
    if (PREVIEW) { $('#aviso-preview').hidden = false; document.body.classList.add('modo-preview'); }

    try {
      estado.catalogo = await cargarCatalogo();
    } catch (e) {
      $('#resumen').textContent = 'No fue posible cargar el catálogo. Revisa tu conexión e inténtalo de nuevo.';
      console.error(e);
      return;
    }
    prepararCatalogo();
    pintarCabecera();
    pintarCategorias();
    aplicarFiltros();
    pintarContadorCarrito();
    abrirDesdeHash();
  }

  async function cargarCatalogo() {
    if (PREVIEW) {
      const b = await Datos.cargarBorrador();
      if (b) return b;
    }
    try {
      const cat = await Datos.cargarPublicado();
      Datos.idb.set('kv', 'publicado', cat).catch(() => {});
      return cat;
    } catch (e) {
      // Respaldo: última copia guardada en el dispositivo
      const copia = await Datos.idb.get('kv', 'publicado').catch(() => null);
      if (copia) return Datos.normalizar(copia);
      throw e;
    }
  }

  function prepararCatalogo() {
    const cat = estado.catalogo;
    cat.productos = cat.productos.filter(p => p && p.id && p.visible !== false);
    // Destacados primero, el resto conserva el orden definido por el administrador
    cat.productos.sort((a, b) => (b.destacado ? 1 : 0) - (a.destacado ? 1 : 0));
    for (const p of cat.productos) {
      estado.porId.set(p.id, p);
      estado.indice.set(p.id, sinAcentos([p.nombre, p.ref, p.categoria, p.descripcion, (p.etiquetas || []).join(' ')].join(' ')));
    }
  }

  function pintarCabecera() {
    const a = estado.catalogo.ajustes;
    $('#nombre-negocio').textContent = a.negocio;
    $('#eslogan').textContent = a.eslogan || '';
    document.title = a.negocio + ' · Catálogo';
  }

  // ---------------- Categorías y filtros ----------------
  function pintarCategorias() {
    const conteo = new Map();
    for (const p of estado.catalogo.productos) conteo.set(p.categoria, (conteo.get(p.categoria) || 0) + 1);
    const orden = estado.catalogo.categorias.filter(c => conteo.has(c));
    for (const c of conteo.keys()) if (c && !orden.includes(c)) orden.push(c);

    const chips = [`<button class="chip" data-cat="" aria-pressed="true">Todos <small>${estado.catalogo.productos.length}</small></button>`]
      .concat(orden.map(c => `<button class="chip" data-cat="${esc(c)}" aria-pressed="false">${esc(c)} <small>${conteo.get(c)}</small></button>`));
    $('#categorias').innerHTML = chips.join('');
  }

  function aplicarFiltros() {
    const palabras = sinAcentos(estado.texto).split(/\s+/).filter(Boolean);
    estado.filtrados = estado.catalogo.productos.filter(p => {
      if (estado.categoria && p.categoria !== estado.categoria) return false;
      if (!palabras.length) return true;
      const t = estado.indice.get(p.id);
      return palabras.every(w => t.includes(w));
    });
    estado.mostrados = 0;
    $('#grilla').innerHTML = '';
    $('#vacio').hidden = estado.filtrados.length > 0;
    const n = estado.filtrados.length;
    $('#resumen').textContent = n === 1 ? '1 producto' : n + ' productos';
    pintarSiguientePagina();
  }

  function pintarSiguientePagina() {
    const lote = estado.filtrados.slice(estado.mostrados, estado.mostrados + POR_PAGINA);
    if (!lote.length) return;
    $('#grilla').insertAdjacentHTML('beforeend', lote.map(tarjetaHTML).join(''));
    estado.mostrados += lote.length;
    if (PREVIEW) resolverImagenesPreview();
  }

  // ---------------- Tarjetas ----------------
  function miniatura(p, clase) {
    if (p.imagen) {
      const src = PREVIEW ? '' : esc(p.imagen);
      return `<img class="${clase}" ${PREVIEW ? `data-media="${esc(p.imagen)}"` : `src="${src}"`} alt="${esc(p.nombre)}" loading="lazy" decoding="async">`;
    }
    const h = colorDe(p.categoria || p.nombre);
    return `<div class="${clase} sin-imagen" style="--h:${h}" aria-hidden="true"><span>${esc(iniciales(p.nombre))}</span></div>`;
  }

  function tarjetaHTML(p) {
    const enCarrito = cantidadEnCarrito(p.id);
    return `<article class="tarjeta" data-id="${esc(p.id)}">
      <button class="tarjeta-media" data-abrir="${esc(p.id)}" aria-label="Ver ${esc(p.nombre)}">
        ${miniatura(p, 'tarjeta-img')}
        ${p.video ? '<span class="insignia-video" title="Tiene video">▶ Video</span>' : ''}
        ${p.destacado ? '<span class="insignia-dest">Destacado</span>' : ''}
      </button>
      <div class="tarjeta-cuerpo">
        <p class="tarjeta-cat">${esc(p.categoria || '')}</p>
        <h3 class="tarjeta-nombre"><a href="#p=${encodeURIComponent(p.id)}" data-abrir="${esc(p.id)}">${esc(p.nombre)}</a></h3>
        ${p.ref ? `<p class="tarjeta-ref">Ref. ${esc(p.ref)}</p>` : ''}
        <div class="tarjeta-accion">${accionHTML(p.id, enCarrito)}</div>
      </div>
    </article>`;
  }

  function accionHTML(id, cant) {
    if (!cant) return `<button class="btn btn-pri btn-bloque" data-agregar="${esc(id)}" aria-label="Agregar a cotización">+ Agregar</button>`;
    return `<div class="cantidad cantidad-tarjeta">
      <button data-mas="${esc(id)}" data-delta="-1" aria-label="Menos">−</button>
      <span>${cant} en lista</span>
      <button data-mas="${esc(id)}" data-delta="1" aria-label="Más">+</button>
    </div>`;
  }

  function refrescarTarjeta(id) {
    const t = document.querySelector(`.tarjeta[data-id="${CSS.escape(id)}"] .tarjeta-accion`);
    if (t) t.innerHTML = accionHTML(id, cantidadEnCarrito(id));
  }

  async function resolverImagenesPreview(raiz = document) {
    for (const img of raiz.querySelectorAll('img[data-media]')) {
      const ruta = img.dataset.media;
      img.removeAttribute('data-media');
      img.src = await Datos.resolverMedia(ruta);
    }
  }

  // ---------------- Detalle ----------------
  let detalleActual = null;
  let detalleEmpujoHistorial = false;

  async function abrirDetalle(id, desdeHash) {
    const p = estado.porId.get(id);
    if (!p) return;
    detalleActual = p;
    $('#det-cat').textContent = p.categoria || '';
    $('#det-nombre').textContent = p.nombre;
    $('#det-ref').textContent = p.ref ? 'Referencia: ' + p.ref : '';
    $('#det-desc').textContent = p.descripcion || '';
    $('#det-cantidad').value = 1;
    $('#det-agregar').textContent = cantidadEnCarrito(id) ? 'Agregar más a la cotización' : 'Agregar a cotización';
    await pintarMediaDetalle(p);

    const dlg = $('#dlg-producto');
    if (!dlg.open) dlg.showModal();
    dlg.scrollTop = 0;
    if (!desdeHash) {
      history.pushState({ p: id }, '', '#p=' + encodeURIComponent(id));
      detalleEmpujoHistorial = true;
    }
  }

  async function pintarMediaDetalle(p) {
    const cont = $('#det-media');
    const btnGuardar = $('#det-guardar-video');
    btnGuardar.hidden = true;
    const yt = idYouTube(p.video);
    const imagen = p.imagen ? await resolver(p.imagen) : '';

    if (yt) {
      cont.innerHTML = navigator.onLine
        ? `<div class="video-yt"><iframe src="https://www.youtube-nocookie.com/embed/${yt}?rel=0" title="Video de ${esc(p.nombre)}" allow="encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
        : (imagen ? `<img src="${esc(imagen)}" alt="${esc(p.nombre)}">` : miniatura(p, 'det-img')) + '<p class="nota-media">El video de YouTube necesita conexión a internet.</p>';
    } else if (p.video) {
      const src = await resolver(p.video);
      const local = /^blob:/.test(src);
      if (!navigator.onLine && !local && !(await estaEnCache(src))) {
        cont.innerHTML = (imagen ? `<img src="${esc(imagen)}" alt="${esc(p.nombre)}">` : miniatura(p, 'det-img')) +
          '<p class="nota-media">Este video no está descargado en este dispositivo. Con internet, descárgalo desde ⋮ → Descargar catálogo.</p>';
        return;
      }
      cont.innerHTML = `<video controls playsinline preload="metadata" ${imagen ? `poster="${esc(imagen)}"` : ''} src="${esc(src)}"></video>`;
      if (!local) {
        btnGuardar.hidden = false;
        btnGuardar.disabled = false;
        btnGuardar.textContent = (await estaEnCache(src)) ? '✓ Video disponible sin conexión' : 'Guardar video para ver sin conexión';
      }
    } else if (imagen) {
      cont.innerHTML = `<img src="${esc(imagen)}" alt="${esc(p.nombre)}">`;
    } else {
      cont.innerHTML = miniatura(p, 'det-img');
    }
  }

  const resolver = (ruta) => PREVIEW ? Datos.resolverMedia(ruta) : Promise.resolve(ruta);

  function alCerrarDetalle() {
    const v = $('#det-media video');
    if (v) v.pause();
    $('#det-media').innerHTML = '';   // detiene videos / iframes
    detalleActual = null;
    if (location.hash.startsWith('#p=')) {
      if (detalleEmpujoHistorial) history.back();
      else history.replaceState(null, '', location.pathname + location.search);
    }
    detalleEmpujoHistorial = false;
  }

  function abrirDesdeHash() {
    const m = location.hash.match(/^#p=(.+)$/);
    const dlg = $('#dlg-producto');
    if (m) {
      const id = decodeURIComponent(m[1]);
      if (!detalleActual || detalleActual.id !== id) abrirDetalle(id, true);
    } else if (dlg.open) {
      detalleEmpujoHistorial = false;
      dlg.close();
    }
  }

  // ---------------- Carrito ----------------
  function leerCarrito() {
    try { return JSON.parse(localStorage.getItem('carrito')) || []; } catch (e) { return []; }
  }
  function guardarCarrito() {
    try { localStorage.setItem('carrito', JSON.stringify(estado.carrito)); } catch (e) { /* almacenamiento lleno o bloqueado */ }
    pintarContadorCarrito();
  }
  function cantidadEnCarrito(id) {
    const it = estado.carrito.find(i => i.id === id);
    return it ? it.cant : 0;
  }
  function cambiarCantidad(id, delta, absoluto) {
    const p = estado.porId.get(id);
    let it = estado.carrito.find(i => i.id === id);
    if (!it) {
      if (!p || (absoluto == null && delta <= 0)) return;
      it = { id, nombre: p.nombre, ref: p.ref || '', cant: 0 };
      estado.carrito.push(it);
    }
    it.cant = absoluto != null ? absoluto : it.cant + delta;
    if (it.cant <= 0) estado.carrito = estado.carrito.filter(i => i.id !== id);
    guardarCarrito();
    refrescarTarjeta(id);
    if ($('#dlg-carrito').open) pintarCarrito();
  }

  function pintarContadorCarrito() {
    const total = estado.carrito.reduce((s, i) => s + i.cant, 0);
    const c = $('#contador-carrito');
    c.textContent = total > 99 ? '99+' : total;
    c.hidden = total === 0;
  }

  function pintarCarrito() {
    const lista = $('#carrito-lista');
    const vacio = estado.carrito.length === 0;
    $('#form-cotizar').hidden = vacio;
    if (vacio) {
      lista.innerHTML = `<div class="carrito-vacio"><p>Tu lista está vacía.</p><p class="nota">Agrega los productos que te interesan y envíanos la lista por WhatsApp para recibir tu cotización.</p></div>`;
      return;
    }
    lista.innerHTML = estado.carrito.map(it => {
      const p = estado.porId.get(it.id) || { id: it.id, nombre: it.nombre, ref: it.ref };
      return `<div class="item-carrito" data-id="${esc(it.id)}">
        ${miniatura(p, 'item-img')}
        <div class="item-info">
          <p class="item-nombre">${esc(p.nombre)}</p>
          ${p.ref ? `<p class="item-ref">Ref. ${esc(p.ref)}</p>` : ''}
          <div class="cantidad cantidad-chica">
            <button data-mas="${esc(it.id)}" data-delta="-1" aria-label="Menos">−</button>
            <input type="number" min="1" value="${it.cant}" data-cant-id="${esc(it.id)}" inputmode="numeric" aria-label="Cantidad">
            <button data-mas="${esc(it.id)}" data-delta="1" aria-label="Más">+</button>
          </div>
        </div>
        <button class="btn-quitar" data-quitar="${esc(it.id)}" aria-label="Quitar ${esc(p.nombre)}">&times;</button>
      </div>`;
    }).join('');
    if (PREVIEW) resolverImagenesPreview(lista);
  }

  function mensajeWhatsApp() {
    const a = estado.catalogo.ajustes;
    const nombre = $('#cliente-nombre').value.trim();
    const nota = $('#cliente-nota').value.trim();
    const unidades = estado.carrito.reduce((s, i) => s + i.cant, 0);
    const lineas = [
      a.saludo || 'Hola, quiero cotizar los siguientes productos:',
      ''
    ];
    estado.carrito.forEach((it, n) => {
      const p = estado.porId.get(it.id) || it;
      lineas.push(`${n + 1}. *${p.nombre}*${p.ref ? ' (Ref. ' + p.ref + ')' : ''} - Cant: ${it.cant}`);
    });
    lineas.push('', `Total: ${estado.carrito.length} producto(s), ${unidades} unidad(es)`);
    if (nombre) lineas.push('', 'Mi nombre: ' + nombre);
    if (nota) lineas.push('Comentario: ' + nota);
    return lineas.join('\n');
  }

  async function enviarWhatsApp(ev) {
    ev.preventDefault();
    if (!estado.carrito.length) return;
    const numero = String(estado.catalogo.ajustes.whatsapp || '').replace(/\D/g, '');
    if (!numero) { toast('El número de WhatsApp del negocio no está configurado.'); return; }
    try { localStorage.setItem('cliente-nombre', $('#cliente-nombre').value.trim()); } catch (e) {}
    const url = 'https://wa.me/' + numero + '?text=' + encodeURIComponent(mensajeWhatsApp());

    const btn = $('#btn-whatsapp');
    btn.disabled = true;
    const conInternet = await hayInternet();
    btn.disabled = false;

    // Sin internet: el enlace se muestra como código QR para escanearlo con otro celular
    if (!conInternet) { mostrarQR(url); return; }

    // Con internet: se abre WhatsApp como siempre
    ofrecerVaciarAlVolver();
    const w = window.open(url, '_blank');
    if (w) w.opener = null;
    else location.href = url;
  }

  // navigator.onLine solo dice si hay red, no si hay internet (en zonas rurales
  // es común tener señal sin datos). Se confirma con una petición rápida.
  async function hayInternet() {
    if (!navigator.onLine) return false;
    const control = new AbortController();
    const t = setTimeout(() => control.abort(), 2500);
    try {
      await fetch('https://wa.me/?_=' + Date.now(), { mode: 'no-cors', cache: 'no-store', signal: control.signal });
      return true;
    } catch (e) {
      return false;
    } finally {
      clearTimeout(t);
    }
  }

  function mostrarQR(url) {
    const cont = $('#qr-codigo');
    const unidades = estado.carrito.reduce((s, i) => s + i.cant, 0);
    let qr = null;
    try { qr = QR.crear(url); } catch (e) { /* demasiado largo */ }
    if (qr) {
      cont.innerHTML = QR.svg(qr, 'Código QR para enviar la cotización por WhatsApp');
      cont.hidden = false;
      $('#qr-resumen').textContent = `${estado.carrito.length} producto(s), ${unidades} unidad(es).`;
      $('#qr-denso').hidden = qr.version <= 25;
    } else {
      cont.innerHTML = '';
      cont.hidden = true;
      $('#qr-resumen').textContent = 'La lista es demasiado larga para un solo código QR. Divide la cotización en dos listas más cortas.';
      $('#qr-denso').hidden = true;
    }
    $('#btn-qr-listo').hidden = !qr;
    $('#qr-abrir').href = url;
    $('#dlg-qr').showModal();
  }

  function vaciarLista() {
    const ids = estado.carrito.map(i => i.id);
    estado.carrito = [];
    guardarCarrito();
    ids.forEach(refrescarTarjeta);
    $('#cliente-nombre').value = '';
    $('#cliente-nota').value = '';
    try { localStorage.removeItem('cliente-nombre'); } catch (e) {}
  }

  // Al regresar de WhatsApp, ofrecer limpiar la lista para atender al siguiente cliente
  function ofrecerVaciarAlVolver() {
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', alVolver);
      setTimeout(() => {
        if (!estado.carrito.length || !confirm('¿Ya enviaste la cotización por WhatsApp?\n\nToca "Aceptar" para vaciar la lista y empezar una nueva.')) return;
        vaciarLista();
        $('#dlg-carrito').close();
        toast('Lista vacía. Lista para el siguiente cliente.');
      }, 400);
    };
    document.addEventListener('visibilitychange', alVolver);
  }

  // ---------------- Uso sin conexión ----------------
  async function estaEnCache(url) {
    if (!('caches' in window)) return false;
    try { return !!(await caches.match(new URL(url, location.href).href)); } catch (e) { return false; }
  }

  async function guardarEnCache(urls, alAvanzar) {
    const cache = await caches.open(CACHE_MEDIA);
    let hechos = 0, fallos = 0;
    const cola = urls.slice();
    async function trabajador() {
      while (cola.length) {
        const u = new URL(cola.shift(), location.href);
        try {
          if (!(await cache.match(u.href))) {
            // Externos: primero con CORS (permite adelantar videos sin conexión);
            // si el servidor no lo permite, se guarda como respuesta opaca.
            const res = u.origin === location.origin
              ? await fetch(u.href)
              : await fetch(u.href, { mode: 'cors' }).catch(() => fetch(u.href, { mode: 'no-cors' }));
            if (res.ok || res.type === 'opaque') await cache.put(u.href, res);
            else fallos++;
          }
        } catch (e) { fallos++; }
        hechos++;
        alAvanzar && alAvanzar(hechos, urls.length);
      }
    }
    await Promise.all([1, 2, 3, 4].map(trabajador));
    return fallos;
  }

  async function descargarTodo() {
    if (!('caches' in window)) { toast('Tu navegador no permite guardar el catálogo.'); return; }
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    const conVideos = $('#chk-videos').checked;
    const urls = new Set();
    for (const p of estado.catalogo.productos) {
      if (p.imagen && !/^(data|blob):/.test(p.imagen)) urls.add(p.imagen);
      if (conVideos && p.video && !idYouTube(p.video) && !/^(data|blob):/.test(p.video)) urls.add(p.video);
    }
    if (!urls.size) { $('#progreso').hidden = false; $('#progreso-txt').textContent = 'Listo. El catálogo está disponible sin conexión.'; return; }
    const btn = $('#btn-descargar');
    btn.disabled = true;
    $('#progreso').hidden = false;
    const fallos = await guardarEnCache([...urls], (h, t) => {
      $('#progreso-barra').style.width = Math.round(h / t * 100) + '%';
      $('#progreso-txt').textContent = `Guardando ${h} de ${t} archivos…`;
    });
    btn.disabled = false;
    $('#progreso-txt').textContent = fallos
      ? `Listo. ${fallos} archivo(s) no se pudieron guardar (revisa tu conexión y vuelve a intentarlo).`
      : 'Listo. El catálogo está disponible sin conexión.';
    mostrarEspacio();
  }

  async function mostrarEspacio() {
    if (estado.catalogo) {
      const f = new Date(estado.catalogo.actualizado);
      $('#fecha-catalogo').textContent = isNaN(f) ? '' :
        'Catálogo en este dispositivo: actualizado el ' + f.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' }) +
        ' (' + estado.catalogo.productos.length + ' productos).';
    }
    if (!(navigator.storage && navigator.storage.estimate)) return;
    const { usage, quota } = await navigator.storage.estimate();
    const mb = (b) => (b / 1048576).toFixed(b > 1e8 ? 0 : 1) + ' MB';
    $('#espacio').textContent = `Espacio usado en este dispositivo: ${mb(usage)} de ${mb(quota)} disponibles.`;
  }

  // ---------------- Eventos ----------------
  function eventos() {
    let t;
    $('#buscar').addEventListener('input', (e) => {
      clearTimeout(t);
      t = setTimeout(() => { estado.texto = e.target.value; aplicarFiltros(); }, 150);
    });
    $('#btn-limpiar').addEventListener('click', () => {
      $('#buscar').value = ''; estado.texto = ''; estado.categoria = '';
      document.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c.dataset.cat === '' ? 'true' : 'false'));
      aplicarFiltros();
    });
    $('#categorias').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      estado.categoria = chip.dataset.cat;
      document.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'));
      aplicarFiltros();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    new IntersectionObserver((ents) => {
      if (ents.some(e => e.isIntersecting) && estado.catalogo) pintarSiguientePagina();
    }, { rootMargin: '800px' }).observe($('#centinela'));

    // Delegación de clics: grilla, carrito y detalle
    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-abrir],[data-agregar],[data-mas],[data-quitar],[data-cerrar]');
      if (!el) return;
      if (el.dataset.abrir) { e.preventDefault(); abrirDetalle(el.dataset.abrir); }
      else if (el.dataset.agregar) { cambiarCantidad(el.dataset.agregar, 1); toast('Agregado a tu lista de cotización'); }
      else if (el.dataset.mas) cambiarCantidad(el.dataset.mas, Number(el.dataset.delta));
      else if (el.dataset.quitar) cambiarCantidad(el.dataset.quitar, 0, 0);
      else if (el.hasAttribute('data-cerrar')) el.closest('dialog').close();
    });
    document.addEventListener('change', (e) => {
      const id = e.target.dataset.cantId;
      if (id) cambiarCantidad(id, 0, Math.max(0, parseInt(e.target.value, 10) || 0));
    });

    // Cerrar diálogos tocando el fondo
    document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

    // Detalle
    $('#dlg-producto').addEventListener('close', alCerrarDetalle);
    $('#dlg-producto').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cant]');
      if (!b) return;
      const inp = $('#det-cantidad');
      inp.value = Math.max(1, (parseInt(inp.value, 10) || 1) + Number(b.dataset.cant));
    });
    $('#det-agregar').addEventListener('click', () => {
      if (!detalleActual) return;
      const n = Math.max(1, parseInt($('#det-cantidad').value, 10) || 1);
      cambiarCantidad(detalleActual.id, n);
      toast(`Agregado: ${detalleActual.nombre} (${n})`);
      $('#dlg-producto').close();
    });
    $('#det-guardar-video').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const v = $('#det-media video');
      if (!v) return;
      btn.disabled = true;
      btn.textContent = 'Guardando video…';
      const fallos = await guardarEnCache([v.getAttribute('src')]);
      btn.textContent = fallos ? 'No se pudo guardar. Intenta de nuevo.' : '✓ Video disponible sin conexión';
      btn.disabled = !fallos;
    });
    window.addEventListener('popstate', abrirDesdeHash);
    window.addEventListener('hashchange', abrirDesdeHash);

    // Carrito
    $('#btn-carrito').addEventListener('click', () => {
      pintarCarrito();
      try { $('#cliente-nombre').value = localStorage.getItem('cliente-nombre') || ''; } catch (e) {}
      $('#dlg-carrito').showModal();
    });
    $('#form-cotizar').addEventListener('submit', enviarWhatsApp);
    $('#btn-vaciar').addEventListener('click', () => {
      if (!confirm('¿Quitar todos los productos de tu lista?')) return;
      vaciarLista();
      pintarCarrito();
    });
    $('#btn-qr-listo').addEventListener('click', () => {
      vaciarLista();
      $('#dlg-qr').close();
      $('#dlg-carrito').close();
      toast('Lista vacía. Lista para el siguiente cliente.');
    });

    // Menú sin conexión
    $('#btn-menu').addEventListener('click', () => { mostrarEspacio(); $('#dlg-menu').showModal(); });
    $('#btn-descargar').addEventListener('click', descargarTodo);

    // Conexión
    window.addEventListener('online', actualizarAvisoOffline);
    window.addEventListener('offline', actualizarAvisoOffline);

    // Instalación como app
    let eventoInstalar = null;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      eventoInstalar = e;
      $('#btn-instalar').hidden = false;
    });
    $('#btn-instalar').addEventListener('click', async () => {
      if (!eventoInstalar) return;
      eventoInstalar.prompt();
      await eventoInstalar.userChoice;
      eventoInstalar = null;
      $('#btn-instalar').hidden = true;
    });
  }

  function actualizarAvisoOffline() {
    $('#aviso-offline').hidden = navigator.onLine;
  }

  let toastT;
  function toast(msg) {
    const el = $('#toast');
    // Dentro del diálogo abierto para que se vea por encima del fondo oscuro
    const abierto = [...document.querySelectorAll('dialog[open]')].pop();
    (abierto || document.body).appendChild(el);
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove('visible'), 2600);
  }

  function registrarSW() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service Worker no registrado:', err));
      });
    }
  }
})();
