/* ============================================================
   Generador de códigos QR (ISO/IEC 18004) sin librerías
   Modo byte (UTF-8), versiones 1–40, corrección de errores L o M.
   Uso:
     const qr = QR.crear('https://wa.me/57...');   // { tam, modulos[y][x], version }
     elemento.innerHTML = QR.svg(qr);
   Basado en el diseño de "QR Code generator library" de Project Nayuki (MIT).
   ============================================================ */
(function () {
  // Índices: [0] = L, [1] = M ; posición = versión (la 0 no se usa)
  const ECC_POR_BLOQUE = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28]
  ];
  const NUM_BLOQUES = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49]
  ];
  const BITS_FORMATO = [1, 0];   // L = 01, M = 00

  const bit = (x, i) => ((x >>> i) & 1) !== 0;

  function modulosDatosCrudos(ver) {
    let r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      const n = Math.floor(ver / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  const codewordsDatos = (ver, ecl) =>
    Math.floor(modulosDatosCrudos(ver) / 8) - ECC_POR_BLOQUE[ecl][ver] * NUM_BLOQUES[ecl][ver];

  // ---------- Reed-Solomon sobre GF(2^8), polinomio 0x11D ----------
  function mulGF(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function divisorRS(grado) {
    const r = new Array(grado).fill(0);
    r[grado - 1] = 1;
    let raiz = 1;
    for (let i = 0; i < grado; i++) {
      for (let j = 0; j < r.length; j++) {
        r[j] = mulGF(r[j], raiz);
        if (j + 1 < r.length) r[j] ^= r[j + 1];
      }
      raiz = mulGF(raiz, 0x02);
    }
    return r;
  }
  function restoRS(datos, divisor) {
    const r = divisor.map(() => 0);
    for (const b of datos) {
      const factor = b ^ r.shift();
      r.push(0);
      divisor.forEach((coef, i) => { r[i] ^= mulGF(coef, factor); });
    }
    return r;
  }

  // ---------- Codificación de datos ----------
  function crear(texto) {
    const bytes = Array.from(new TextEncoder().encode(texto));

    // Versión mínima con corrección L; luego se sube a M si cabe en la misma versión
    let ver, ecl = 0, bitsUsados;
    for (ver = 1; ; ver++) {
      bitsUsados = 4 + (ver < 10 ? 8 : 16) + bytes.length * 8;
      if (bitsUsados <= codewordsDatos(ver, 0) * 8) break;
      if (ver >= 40) throw new Error('DEMASIADO_LARGO');
    }
    if (bitsUsados <= codewordsDatos(ver, 1) * 8) ecl = 1;

    const bits = [];
    const agregar = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    agregar(0b0100, 4);                                  // modo byte
    agregar(bytes.length, ver < 10 ? 8 : 16);
    bytes.forEach(b => agregar(b, 8));
    const capacidad = codewordsDatos(ver, ecl) * 8;
    agregar(0, Math.min(4, capacidad - bits.length));    // terminador
    agregar(0, (8 - bits.length % 8) % 8);
    for (let relleno = 0xEC; bits.length < capacidad; relleno ^= 0xEC ^ 0x11) agregar(relleno, 8);

    const datos = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      datos.push(b);
    }

    return construirMatriz(ver, ecl, intercalarConECC(datos, ver, ecl));
  }

  function intercalarConECC(datos, ver, ecl) {
    const numBloques = NUM_BLOQUES[ecl][ver];
    const eccLen = ECC_POR_BLOQUE[ecl][ver];
    const crudos = Math.floor(modulosDatosCrudos(ver) / 8);
    const numCortos = numBloques - crudos % numBloques;
    const largoCorto = Math.floor(crudos / numBloques);
    const div = divisorRS(eccLen);
    const bloques = [];
    for (let i = 0, k = 0; i < numBloques; i++) {
      const dat = datos.slice(k, k + largoCorto - eccLen + (i < numCortos ? 0 : 1));
      k += dat.length;
      const ecc = restoRS(dat, div);
      if (i < numCortos) dat.push(0);
      bloques.push(dat.concat(ecc));
    }
    const r = [];
    for (let i = 0; i < bloques[0].length; i++) {
      bloques.forEach((b, j) => {
        if (i !== largoCorto - eccLen || j >= numCortos) r.push(b[i]);
      });
    }
    return r;
  }

  // ---------- Matriz ----------
  function construirMatriz(ver, ecl, codewords) {
    const tam = ver * 4 + 17;
    const mod = Array.from({ length: tam }, () => new Array(tam).fill(false));
    const fun = Array.from({ length: tam }, () => new Array(tam).fill(false));
    const fijar = (x, y, oscuro) => { mod[y][x] = oscuro; fun[y][x] = true; };

    // Patrones de sincronización
    for (let i = 0; i < tam; i++) { fijar(6, i, i % 2 === 0); fijar(i, 6, i % 2 === 0); }
    // Patrones de búsqueda (las 3 esquinas) con su separador
    for (const [cx, cy] of [[3, 3], [tam - 4, 3], [3, tam - 4]]) {
      for (let dy = -4; dy <= 4; dy++) {
        for (let dx = -4; dx <= 4; dx++) {
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          const x = cx + dx, y = cy + dy;
          if (x >= 0 && x < tam && y >= 0 && y < tam) fijar(x, y, d !== 2 && d !== 4);
        }
      }
    }
    // Patrones de alineación
    const pos = posicionesAlineacion(ver, tam);
    const n = pos.length;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) fijar(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
    dibujarFormato(mod, fun, tam, ecl, 0, fijar);   // reserva el área
    if (ver >= 7) {
      let rem = ver;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const bitsVer = (ver << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const b = bit(bitsVer, i), a = tam - 11 + i % 3, c = Math.floor(i / 3);
        fijar(a, c, b);
        fijar(c, a, b);
      }
    }

    // Datos en zigzag
    let i = 0;
    for (let der = tam - 1; der >= 1; der -= 2) {
      if (der === 6) der = 5;
      for (let v = 0; v < tam; v++) {
        for (let j = 0; j < 2; j++) {
          const x = der - j;
          const arriba = ((der + 1) & 2) === 0;
          const y = arriba ? tam - 1 - v : v;
          if (!fun[y][x] && i < codewords.length * 8) {
            mod[y][x] = bit(codewords[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }

    // Elegir la máscara con menor penalización
    let mejor = 0, menor = Infinity;
    for (let m = 0; m < 8; m++) {
      aplicarMascara(mod, fun, tam, m);
      dibujarFormato(mod, fun, tam, ecl, m, fijar);
      const p = penalizacion(mod, tam);
      if (p < menor) { menor = p; mejor = m; }
      aplicarMascara(mod, fun, tam, m);   // deshacer (XOR)
    }
    aplicarMascara(mod, fun, tam, mejor);
    dibujarFormato(mod, fun, tam, ecl, mejor, fijar);

    return { version: ver, ecl: ecl === 0 ? 'L' : 'M', mascara: mejor, tam, modulos: mod };
  }

  function posicionesAlineacion(ver, tam) {
    if (ver === 1) return [];
    const n = Math.floor(ver / 7) + 2;
    const paso = Math.floor((ver * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
    const r = [6];
    for (let p = tam - 7; r.length < n; p -= paso) r.splice(1, 0, p);
    return r;
  }

  function dibujarFormato(mod, fun, tam, ecl, mascara, fijar) {
    const datos = (BITS_FORMATO[ecl] << 3) | mascara;
    let rem = datos;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const b = ((datos << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) fijar(8, i, bit(b, i));
    fijar(8, 7, bit(b, 6));
    fijar(8, 8, bit(b, 7));
    fijar(7, 8, bit(b, 8));
    for (let i = 9; i < 15; i++) fijar(14 - i, 8, bit(b, i));
    for (let i = 0; i < 8; i++) fijar(tam - 1 - i, 8, bit(b, i));
    for (let i = 8; i < 15; i++) fijar(8, tam - 15 + i, bit(b, i));
    fijar(8, tam - 8, true);   // módulo oscuro fijo
  }

  function aplicarMascara(mod, fun, tam, m) {
    for (let y = 0; y < tam; y++) {
      for (let x = 0; x < tam; x++) {
        if (fun[y][x]) continue;
        let inv;
        switch (m) {
          case 0: inv = (x + y) % 2 === 0; break;
          case 1: inv = y % 2 === 0; break;
          case 2: inv = x % 3 === 0; break;
          case 3: inv = (x + y) % 3 === 0; break;
          case 4: inv = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: inv = (x * y) % 2 + (x * y) % 3 === 0; break;
          case 6: inv = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
          default: inv = ((x + y) % 2 + (x * y) % 3) % 2 === 0;
        }
        if (inv) mod[y][x] = !mod[y][x];
      }
    }
  }

  // Penalización según la norma (reglas 1–4), sobre filas y columnas como texto
  function penalizacion(mod, tam) {
    let p = 0, oscuros = 0;
    const lineas = [];
    for (let y = 0; y < tam; y++) {
      let fila = '', col = '';
      for (let x = 0; x < tam; x++) {
        fila += mod[y][x] ? '1' : '0';
        col += mod[x][y] ? '1' : '0';
        if (mod[y][x]) oscuros++;
      }
      lineas.push(fila, col);
    }
    for (const l of lineas) {
      for (const tramo of l.match(/0{5,}|1{5,}/g) || []) p += tramo.length - 2;          // regla 1
      const ext = '0000' + l + '0000';
      p += 40 * ((ext.match(/(?=00001011101)|(?=10111010000)/g) || []).length);        // regla 3
    }
    for (let y = 0; y < tam - 1; y++) {                                                 // regla 2
      for (let x = 0; x < tam - 1; x++) {
        const c = mod[y][x];
        if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
      }
    }
    const total = tam * tam;                                                            // regla 4
    p += 10 * (Math.ceil(Math.abs(oscuros * 20 - total * 10) / total) - 1);
    return p;
  }

  // ---------- Dibujo en SVG (negro sobre blanco, con margen de 4 módulos) ----------
  function svg(qr, titulo) {
    const m = 4, lado = qr.tam + m * 2;
    let d = '';
    for (let y = 0; y < qr.tam; y++) {
      for (let x = 0; x < qr.tam; x++) if (qr.modulos[y][x]) d += `M${x + m} ${y + m}h1v1h-1z`;
    }
    // Estilos en línea: así ninguna regla CSS de la página (p. ej. trazos de íconos) altera el código
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges" role="img" aria-label="${titulo || 'Código QR'}" style="stroke:none">` +
      `<rect width="${lado}" height="${lado}" style="fill:#fff;stroke:none"/><path d="${d}" style="fill:#000;stroke:none"/></svg>`;
  }

  window.QR = { crear, svg };
})();
