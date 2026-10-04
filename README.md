# Catálogo PWA con cotización por WhatsApp

Catálogo web **sin precios** que funciona **sin conexión**, se puede instalar en el celular como app y permite que el cliente arme una lista de productos y la envíe por **WhatsApp** al dueño para que este le haga la cotización.

Hecho solo con **HTML, CSS y JavaScript** (sin frameworks ni librerías).

## 1. Usuario y contraseña del administrador

Credenciales de demostración: **admin / cambiar123** (cámbialas antes de entregar).

La contraseña **nunca** se escribe en el código: en [`js/config.js`](js/config.js) solo se guarda una huella cifrada (PBKDF2-SHA256 con sal), porque en GitHub Pages el código es público. Para cambiarla:

1. Abre `generar-clave.html` en el sitio publicado (o en `localhost`).
2. Escribe el usuario y la contraseña nuevos → **Generar** → **Copiar**.
3. Reemplaza en `js/config.js` las líneas `ADMIN_USUARIO`, `ADMIN_SAL` y `ADMIN_CLAVE_HASH` y guarda (en GitHub: lápiz → *Commit changes*).

El panel queda en `https://tu-sitio/admin.html` (no aparece enlazado en el catálogo).

## 2. Probarlo en tu computador

El Service Worker solo funciona en `https://` o en `localhost`, así que no basta con abrir el `index.html` con doble clic. Desde esta carpeta:

```bash
python -m http.server 8080
```

Luego abre <http://localhost:8080> (catálogo) y <http://localhost:8080/admin.html> (panel).

## 3. Cómo lo usa el cliente

1. Abre el enlace del catálogo (no necesita registrarse).
2. Busca o filtra por categoría, toca un producto para ver la descripción y el video.
3. Pulsa **+ Agregar** en los que le interesan y ajusta cantidades.
4. En **Cotizar** escribe (opcional) su nombre y un comentario y pulsa **Solicitar cotización por WhatsApp**: se abre WhatsApp con un mensaje como este, dirigido a tu número:

```
Hola, quiero cotizar los siguientes productos:

1. *Taladro percutor Mini* (Ref. HER-1161) — Cant: 2
2. *Esmalte sintético Max* (Ref. PIN-1069) — Cant: 1

Total: 2 producto(s), 3 unidad(es)

Mi nombre: Juan Pérez
Comentario: Entrega en Popayán
```

**Sin conexión:** después de la primera visita el catálogo abre sin internet. En el menú **⋮** el cliente puede usar **Descargar catálogo** para guardar todas las imágenes (y opcionalmente los videos). Desde el detalle de un producto también puede guardar un video puntual.

### Empleados en zonas sin internet

**Antes de salir (con WiFi):**
1. Abrir el link del catálogo en Chrome (Android) o Safari (iPhone) e **instalarlo**: botón ⬇ de la cabecera, o menú del navegador → *Agregar a pantalla de inicio*.
2. Abrir la app instalada → **⋮ → marcar "Incluir videos" → Descargar catálogo** y esperar a que diga *Listo*. Ahí mismo se ve la fecha del catálogo guardado.
3. Repetir el paso 2 cada vez que el dueño publique productos nuevos (solo descarga lo que falta).

**En campo (sin internet):** abrir la app desde el ícono, mostrar productos y videos al cliente, armar la lista, escribir el nombre del cliente en *Tu nombre* y pulsar **Solicitar cotización por WhatsApp**.

- **Con internet:** se abre WhatsApp con la cotización, como siempre.
- **Sin internet** (o con señal pero sin datos, que se detecta con una verificación de 2,5 s): en lugar de abrir WhatsApp se muestra un **código QR** con el enlace de la cotización. Se escanea con la cámara de un celular que tenga WhatsApp y datos (por ejemplo el del cliente) y se abre el chat con el mensaje listo para enviar. Después se toca **Ya se escaneó · Vaciar lista** para atender al siguiente cliente.
- Un QR cómodo de escanear admite unos **13 productos**; caben hasta unos **34**. Si la lista es más larga, la app pide dividirla en dos.
- El QR se genera dentro de la app ([`js/qr.js`](js/qr.js), sin librerías ni internet).

## 4. Cómo administra el dueño

En `admin.html`, después de ingresar:

| Pestaña | Qué hace |
|---|---|
| **Productos** | Crear, editar, eliminar, ocultar/mostrar y destacar productos. Subir imagen (se reduce automáticamente a 1200 px en WebP) y video (MP4 recomendado, menos de 20 MB) o pegar un enlace (ruta, URL o YouTube). |
| **Categorías** | Crear, renombrar, ordenar y eliminar categorías. |
| **Ajustes** | Nombre del negocio, eslogan, número de WhatsApp y saludo del mensaje. Botón para probar WhatsApp. |
| **Publicar** | Publicar en GitHub con un botón, o descargar el paquete `.zip`; exportar/importar `catalogo.json` y descartar cambios. |

### Publicar los cambios (importante)

Este proyecto es un **sitio estático**: no tiene servidor ni base de datos. Lo que el dueño edita se guarda automáticamente **en su propio navegador** (IndexedDB) y lo ve al instante con **Vista previa**. Para que los clientes lo vean, debe **publicar**:

#### Opción A — Botón "Publicar ahora en GitHub" (recomendada)

Se configura **una sola vez por dispositivo**:

1. En GitHub, con la cuenta dueña del repositorio, abre <https://github.com/settings/personal-access-tokens/new> (*Fine-grained token*):
   - **Token name:** `Catálogo`. **Expiration:** la que prefieras (por ejemplo 1 año; al vencer se crea otro).
   - **Repository access:** *Only select repositories* → el repositorio del catálogo.
   - **Permissions → Repository permissions → Contents:** *Read and write*.
   - **Generate token** y cópialo.
2. En el panel → **Publicar** → **Conexión con GitHub**: usuario, repositorio, rama (`main`) y el token → **Guardar y probar conexión**. Si el panel está en `usuario.github.io/repositorio`, usuario y repositorio se llenan solos.

Desde ahí, cada vez que quiera publicar: **Publicar → Publicar ahora en GitHub**. El panel sube `data/catalogo.json` y las imágenes/videos nuevos en **un solo commit**, y avisa cuando GitHub Pages ya muestra los cambios (normalmente 1–2 minutos).

El token **solo queda en ese navegador** (nunca en el código ni en el repositorio). Si se pierde el dispositivo, borra el token en GitHub (*Settings → Developer settings → Personal access tokens*); también se puede quitar con **Olvidar token**.

#### Opción B — Manual

**Publicar manualmente → Descargar paquete (.zip)**, descomprímelo y sube las carpetas `data` y `media` al hosting (en GitHub: *Add file → Upload files → Commit changes*).

El panel muestra “● Tienes cambios sin publicar” hasta que lo publicado coincida con el borrador.

> Edita siempre desde el **mismo navegador y dispositivo**: el borrador vive ahí. Usa **Descargar solo catalogo.json** como copia de seguridad.

## 5. Publicarlo en GitHub Pages

1. En GitHub crea un repositorio **público** vacío (por ejemplo `catalogo`), sin README.
2. Desde esta carpeta:
   ```bash
   git remote add origin https://github.com/USUARIO/catalogo.git
   git push -u origin main
   ```
3. En el repositorio: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` / `(root)` → Save**.
4. En 1–2 minutos queda en `https://USUARIO.github.io/catalogo/` (catálogo) y `.../admin.html` (panel).

Para que el dueño actualice el catálogo, configura en su dispositivo el botón **Publicar ahora en GitHub** (ver sección 4).

Otras opciones con HTTPS: Netlify Drop (<https://app.netlify.com/drop>), Cloudflare Pages o cualquier hosting.

## Estructura

```
index.html            Catálogo público
admin.html            Panel del administrador
manifest.webmanifest  Datos de la app instalable
sw.js                 Service Worker (offline y caché de imágenes/videos)
css/estilos.css       Estilos del catálogo (colores de marca en :root)
css/admin.css         Estilos del panel
generar-clave.html    Crea la huella de usuario/contraseña para config.js
js/config.js          Usuario, huella de la contraseña y valores por defecto
js/datos.js           Carga del catálogo y almacenamiento local (IndexedDB)
js/app.js             Catálogo, búsqueda, detalle, carrito y WhatsApp
js/admin.js           Lógica del panel
js/zip.js             Generador de .zip sin librerías
js/qr.js              Generador de códigos QR sin librerías (cotización offline)
js/github.js          Publicación directa en GitHub (un commit por publicación)
data/catalogo.json    Productos publicados (trae 250 de ejemplo)
media/img, media/video  Imágenes y videos
icons/                Íconos de la app
```

## Notas

- **Seguridad del panel:** como no hay servidor, la verificación de la contraseña ocurre en el navegador. Por eso solo se guarda su huella cifrada; aun así usa una contraseña larga que no uses en otro lado. El panel solo edita el borrador del navegador del dueño: **nadie puede cambiar lo que ven los clientes sin acceso al repositorio de GitHub**, así que la protección real es esa cuenta (actívale la verificación en dos pasos). Si en el futuro se necesita edición en línea en tiempo real desde varios dispositivos, el siguiente paso es conectar un backend (por ejemplo Firebase o Supabase).
- **Rendimiento con 250+ productos:** los productos se muestran de 24 en 24 mientras se hace scroll, las imágenes cargan de forma diferida y los videos solo se descargan al abrir el producto.
- **Videos de YouTube:** se pueden usar, pero no funcionan sin conexión. Para uso offline sube el MP4.
- **Actualizar la app:** si cambias archivos HTML/CSS/JS, los cambios llegan en la siguiente visita. Para forzar la actualización en todos los dispositivos sube `VERSION` en [`sw.js`](sw.js).
- **Datos de ejemplo:** los 250 productos de `data/catalogo.json` son de demostración. Puedes reemplazarlos desde el panel, o importar tu propio `catalogo.json`.
