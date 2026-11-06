/**
 * Backend de la pizzería — Google Apps Script
 * ------------------------------------------------------------
 * Este script vive DENTRO del Google Sheets (Extensiones > Apps Script)
 * y se publica como "Aplicación web". El frontend en React le habla así:
 *
 *   GET  ?action=catalog      -> menú (pizzas + tamaños + precios) y ciudades
 *   GET  ?action=recent       -> últimos pedidos registrados
 *   GET  ?action=ping         -> prueba de conexión
 *   POST  { cityId, channelId, date, items:[{pizzaId, quantity}] }  -> registra una venta
 *
 * Modelo (estrella con dos ramas copo de nieve):
 *   Fac (hechos) -> Dim_Fecha, Dim_sales_channel, Dim_city -> Dim_state,
 *                   Dim_pizza -> Dim_pizza_types
 *
 * La primera vez ejecuta actualizarModelo() desde el editor: crea Dim_state,
 * Dim_sales_channel y las columnas nuevas (time, sk_sales_channel_id,
 * Direccion, sk_state_id, dia_semana). Se puede ejecutar varias veces.
 *
 * Las columnas se buscan por NOMBRE de encabezado, así que no importa
 * el orden de las columnas en cada hoja.
 */

const HOJAS = {
  FAC: 'Fac',
  FECHA: 'Dim_Fecha',
  CIUDAD: 'Dim_city',
  PIZZA: 'Dim_pizza',
  TIPO: 'Dim_pizza_types',
  ESTADO: 'Dim_state',
  CANAL: 'Dim_sales_channel',
};

const DIAS_SEMANA = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const SK_CANAL_SIN_DATO = 0; // miembro "desconocido" para las ventas históricas

const MAX_CANTIDAD_POR_ITEM = 50; // evita registros como quantity = 10000
const MAX_ITEMS_POR_PEDIDO = 30;
const ORDEN_TAMANOS = ['S', 'M', 'L', 'XL', 'XXL'];

/* ============================ Endpoints ============================ */

function doGet(e) {
  const p = (e && e.parameter) || {};
  const action = p.action || 'catalog';
  try {
    if (action === 'catalog') return json_(Object.assign({ ok: true }, obtenerCatalogo_()));
    if (action === 'recent') return json_({ ok: true, orders: obtenerRecientes_(Number(p.limit) || 8) });
    if (action === 'ping') return json_({ ok: true, hora: new Date().toISOString() });
    return json_({ ok: false, error: 'Acción desconocida: ' + action });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error('Petición vacía');
    const body = JSON.parse(e.postData.contents);
    return json_(registrarPedido_(body));
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

/* ============================ Catálogo ============================ */

function obtenerCatalogo_() {
  const tipos = leerTabla_(HOJAS.TIPO).filas;
  const pizzas = leerTabla_(HOJAS.PIZZA).filas;
  const ciudades = leerTabla_(HOJAS.CIUDAD).filas;
  const estado = nombresPorSk_(HOJAS.ESTADO, 'sk_state_id', 'nombre_estado');

  const tipoPorId = {};
  tipos.forEach(function (t) { tipoPorId[String(t.pizza_type_id)] = t; });

  // Agrupa Dim_pizza por tipo -> una tarjeta por pizza con sus tamaños
  const grupos = {};
  pizzas.forEach(function (p) {
    const precio = Number(p.price);
    if (!p.pizza_id || !p.pizza_type_id || !isFinite(precio) || precio <= 0) return;
    const typeId = String(p.pizza_type_id);
    const t = tipoPorId[typeId] || {};
    if (!grupos[typeId]) {
      grupos[typeId] = {
        typeId: typeId,
        skType: t.sk_pizza_type_id || null,
        name: t.name ? String(t.name) : nombreBonito_(typeId),
        category: t.category ? String(t.category) : 'Otras',
        ingredients: t.ingredients ? String(t.ingredients) : '',
        sizes: [],
      };
    }
    const size = String(p.size || '').toUpperCase();
    // Si hay dos registros del mismo tamaño, se queda con el primero
    if (grupos[typeId].sizes.some(function (s) { return s.size === size; })) return;
    grupos[typeId].sizes.push({ pizzaId: String(p.pizza_id), skPizza: p.sk_id_pizza, size: size, price: precio });
  });

  const lista = Object.keys(grupos).map(function (k) {
    const g = grupos[k];
    g.sizes.sort(function (a, b) { return ordenTamano_(a.size) - ordenTamano_(b.size); });
    return g;
  });
  lista.sort(function (a, b) { return a.category.localeCompare(b.category) || a.name.localeCompare(b.name); });

  return {
    pizzas: lista,
    cities: ciudades
      .filter(function (c) { return c.sk_city_id !== '' && c.sk_city_id != null; })
      .map(function (c) {
        return {
          id: Number(c.sk_city_id),
          name: String(c.Descripcion),
          address: c.Direccion ? String(c.Direccion) : '',
          state: estado[Number(c.sk_state_id)] || '',
        };
      }),
    channels: leerCanales_().filter(function (c) { return c.id !== SK_CANAL_SIN_DATO; }),
  };
}

/* ============================ Registrar venta ============================ */

function registrarPedido_(body) {
  // ---- Validación ----
  const cityId = Number(body.cityId);
  const items = Array.isArray(body.items) ? body.items : [];
  const channelId = Number(body.channelId);
  if (!cityId) throw new Error('Selecciona una ciudad');
  if (!channelId) throw new Error('Selecciona el canal de venta');
  if (!items.length) throw new Error('El pedido no tiene pizzas');
  if (items.length > MAX_ITEMS_POR_PEDIDO) throw new Error('Máximo ' + MAX_ITEMS_POR_PEDIDO + ' ítems por pedido');

  const ciudades = leerTabla_(HOJAS.CIUDAD).filas;
  const ciudad = ciudades.filter(function (c) { return Number(c.sk_city_id) === cityId; })[0];
  if (!ciudad) throw new Error('La ciudad ' + cityId + ' no existe en Dim_city');

  const canal = leerCanales_().filter(function (c) { return c.id === channelId; })[0];
  if (!canal) throw new Error('El canal ' + channelId + ' no existe en Dim_sales_channel');

  const pizzas = leerTabla_(HOJAS.PIZZA).filas;
  const precioPorPizza = {};
  pizzas.forEach(function (p) { precioPorPizza[String(p.pizza_id)] = Number(p.price); });

  const limpios = items.map(function (it) {
    const pizzaId = String(it.pizzaId || '');
    const qty = Math.floor(Number(it.quantity));
    if (!(pizzaId in precioPorPizza)) throw new Error('La pizza "' + pizzaId + '" no existe en Dim_pizza');
    if (!(qty >= 1 && qty <= MAX_CANTIDAD_POR_ITEM)) throw new Error('Cantidad inválida para ' + pizzaId + ' (1 a ' + MAX_CANTIDAD_POR_ITEM + ')');
    return { pizzaId: pizzaId, quantity: qty };
  });

  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const fechaTxt = /^\d{4}-\d{2}-\d{2}$/.test(String(body.date || ''))
    ? String(body.date)
    : Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  const horaTxt = Utilities.formatDate(new Date(), tz, 'HH:mm:ss'); // hora en que se registra la venta

  // ---- Escritura protegida con candado (dos compañeros a la vez no chocan) ----
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const fecha = obtenerOCrearSkFecha_(fechaTxt, tz);

    const fac = leerTabla_(HOJAS.FAC, { soloEncabezados: true });
    if (!fac.col.time || !fac.col.sk_sales_channel_id) throw new Error('Falta ejecutar actualizarModelo() en Apps Script');
    const hoja = fac.hoja;
    const ultimaFila = hoja.getLastRow();
    const maxDetalle = maxColumna_(hoja, fac.col.order_details_id, ultimaFila);
    const maxPedido = maxColumna_(hoja, fac.col.order_id, ultimaFila);
    const orderId = maxPedido + 1;

    const filas = limpios.map(function (it, i) {
      const valores = {
        order_details_id: maxDetalle + 1 + i,
        order_id: orderId,
        pizza_id: it.pizzaId,
        sk_city_id: cityId,
        quantity: it.quantity,
        sk_date: fecha.sk,
        time: horaTxt,
        sk_sales_channel_id: channelId,
      };
      return fac.encabezados.map(function (h) { return h in valores ? valores[h] : ''; });
    });

    hoja.getRange(ultimaFila + 1, 1, filas.length, fac.encabezados.length).setValues(filas);
    hoja.getRange(ultimaFila + 1, fac.col.time, filas.length, 1).setNumberFormat('HH:mm:ss');
    SpreadsheetApp.flush();

    const total = limpios.reduce(function (s, it) { return s + it.quantity * precioPorPizza[it.pizzaId]; }, 0);
    return {
      ok: true,
      orderId: orderId,
      firstDetailId: maxDetalle + 1,
      rows: filas.length,
      skDate: fecha.sk,
      skDateIsNew: fecha.nueva,
      date: fechaTxt,
      time: horaTxt,
      city: String(ciudad.Descripcion),
      skCity: cityId,
      channel: canal.name,
      skChannel: channelId,
      total: Math.round(total * 100) / 100,
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Busca la fecha en Dim_Fecha. Si existe devuelve su sk_date;
 * si no existe, CREA la fila con una nueva llave subrogada (max + 1).
 */
function obtenerOCrearSkFecha_(fechaTxt, tz) {
  const t = leerTabla_(HOJAS.FECHA);
  let maxSk = 0;
  for (let i = 0; i < t.filas.length; i++) {
    const f = t.filas[i];
    const sk = Number(f.sk_date) || 0;
    if (sk > maxSk) maxSk = sk;
    if (aTextoFecha_(f.date, tz) === fechaTxt) return { sk: sk, nueva: false };
  }

  const partes = fechaTxt.split('-').map(Number); // [año, mes, día]
  const mes = partes[1];
  const dia = diaSemana_(fechaTxt);
  const valores = {
    sk_date: maxSk + 1,
    date: Utilities.parseDate(fechaTxt, tz, 'yyyy-MM-dd'),
    mes: mes,
    trimestre: Math.ceil(mes / 3),
    semestre: mes <= 6 ? 1 : 2,
    'año': partes[0],
    dia_semana: dia.nombre,
    dia_semana_num: dia.num,
  };
  const fila = t.encabezados.map(function (h) { return h in valores ? valores[h] : ''; });
  t.hoja.getRange(t.hoja.getLastRow() + 1, 1, 1, fila.length).setValues([fila]);
  return { sk: maxSk + 1, nueva: true };
}

/* ============================ Últimos pedidos ============================ */

function obtenerRecientes_(limite) {
  limite = Math.min(Math.max(limite, 1), 30);
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();
  const fac = leerTabla_(HOJAS.FAC, { soloEncabezados: true });
  const ultima = fac.hoja.getLastRow();
  if (ultima < 2) return [];

  const n = Math.min(ultima - 1, limite * 8);
  const datos = fac.hoja.getRange(ultima - n + 1, 1, n, fac.encabezados.length).getValues();

  const precio = {};
  leerTabla_(HOJAS.PIZZA).filas.forEach(function (p) { precio[String(p.pizza_id)] = Number(p.price) || 0; });
  const ciudad = {};
  leerTabla_(HOJAS.CIUDAD).filas.forEach(function (c) { ciudad[Number(c.sk_city_id)] = String(c.Descripcion); });
  const canal = {};
  leerCanales_().forEach(function (k) { canal[k.id] = k.name; });
  const fecha = {};
  leerTabla_(HOJAS.FECHA).filas.forEach(function (f) { fecha[Number(f.sk_date)] = aTextoFecha_(f.date, tz); });

  const c = fac.col;
  const pedidos = [];
  const porId = {};
  for (let i = datos.length - 1; i >= 0; i--) {
    const r = datos[i];
    const id = r[c.order_id - 1];
    if (id === '' || id == null) continue;
    if (!porId[id]) {
      if (pedidos.length >= limite) break;
      porId[id] = {
        orderId: id,
        city: ciudad[Number(r[c.sk_city_id - 1])] || '—',
        skCity: r[c.sk_city_id - 1],
        skDate: r[c.sk_date - 1],
        date: fecha[Number(r[c.sk_date - 1])] || '',
        time: c.time ? aTextoHora_(r[c.time - 1], tz) : '',
        channel: c.sk_sales_channel_id ? canal[Number(r[c.sk_sales_channel_id - 1])] || '' : '',
        items: [],
        total: 0,
      };
      pedidos.push(porId[id]);
    }
    const pid = String(r[c.pizza_id - 1]);
    const qty = Number(r[c.quantity - 1]) || 0;
    porId[id].items.unshift({ pizzaId: pid, quantity: qty });
    porId[id].total = Math.round((porId[id].total + qty * (precio[pid] || 0)) * 100) / 100;
  }
  return pedidos;
}

/* ============================ Utilidades ============================ */

/** Lee una hoja como tabla: encabezados + filas como objetos + índice de columnas (1-based). */
function leerTabla_(nombre, opciones) {
  const hoja = SpreadsheetApp.getActive().getSheetByName(nombre);
  if (!hoja) throw new Error('No existe la hoja "' + nombre + '"');
  const ultimaCol = hoja.getLastColumn();
  const encabezados = hoja.getRange(1, 1, 1, ultimaCol).getValues()[0].map(function (h) { return String(h).trim(); });
  const col = {};
  encabezados.forEach(function (h, i) { if (h) col[h] = i + 1; });

  const res = { hoja: hoja, encabezados: encabezados, col: col, filas: [] };
  if (opciones && opciones.soloEncabezados) return res;

  const ultimaFila = hoja.getLastRow();
  if (ultimaFila < 2) return res;
  res.filas = hoja.getRange(2, 1, ultimaFila - 1, ultimaCol).getValues()
    .filter(function (r) { return r.some(function (v) { return v !== ''; }); })
    .map(function (r) {
      const o = {};
      encabezados.forEach(function (h, i) { if (h) o[h] = r[i]; });
      return o;
    });
  return res;
}

function maxColumna_(hoja, numCol, ultimaFila) {
  if (!numCol) throw new Error('Falta una columna obligatoria en ' + hoja.getName());
  if (ultimaFila < 2) return 0;
  const vals = hoja.getRange(2, numCol, ultimaFila - 1, 1).getValues();
  let max = 0;
  for (let i = 0; i < vals.length; i++) {
    const v = Number(vals[i][0]);
    if (v > max) max = v;
  }
  return max;
}

function aTextoFecha_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
  if (typeof v === 'number') { // número de serie estilo Excel
    return Utilities.formatDate(new Date(Math.round((v - 25569) * 86400000)), 'UTC', 'yyyy-MM-dd');
  }
  return String(v || '').slice(0, 10);
}

/** La columna time puede llegar como Date (1899-12-30 hh:mm:ss), como fracción de día o como texto. */
function aTextoHora_(v, tz) {
  if (Object.prototype.toString.call(v) === '[object Date]') return Utilities.formatDate(v, tz, 'HH:mm:ss');
  if (typeof v === 'number' && v >= 0 && v < 1) {
    const s = Math.round(v * 86400);
    return [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map(function (n) { return ('0' + n).slice(-2); }).join(':');
  }
  return String(v || '');
}

/** 'yyyy-MM-dd' -> { nombre: 'Lunes', num: 1 }  (1 = lunes ... 7 = domingo, para ordenar en Power BI) */
function diaSemana_(fechaTxt) {
  const p = String(fechaTxt).split('-').map(Number);
  const d = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  return { nombre: DIAS_SEMANA[d], num: d === 0 ? 7 : d };
}

function leerCanales_() {
  return leerTabla_(HOJAS.CANAL).filas
    .filter(function (c) { return c.sk_sales_channel_id !== '' && c.sk_sales_channel_id != null; })
    .map(function (c) { return { id: Number(c.sk_sales_channel_id), name: String(c.nombre_canal) }; });
}

/** { sk: nombre } de una dimensión pequeña; vacío si la hoja todavía no existe. */
function nombresPorSk_(hojaNombre, colSk, colNombre) {
  const res = {};
  if (!SpreadsheetApp.getActive().getSheetByName(hojaNombre)) return res;
  leerTabla_(hojaNombre).filas.forEach(function (f) { res[Number(f[colSk])] = String(f[colNombre]); });
  return res;
}

function ordenTamano_(s) {
  const i = ORDEN_TAMANOS.indexOf(s);
  return i === -1 ? 99 : i;
}

function nombreBonito_(id) {
  return 'The ' + String(id).replace(/[_-]+/g, ' ').replace(/\b\w/g, function (m) { return m.toUpperCase(); }) + ' Pizza';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ============================ Pruebas desde el editor ============================ */

/** Ejecuta esta función desde el editor para ver el catálogo en el registro. */
function probarCatalogo() {
  const c = obtenerCatalogo_();
  Logger.log('Pizzas: %s | Ciudades: %s', c.pizzas.length, c.cities.length);
  Logger.log(JSON.stringify(c.pizzas[0]));
}

/** Ejecuta esta función para ver los últimos pedidos (no escribe nada). */
function probarRecientes() {
  Logger.log(JSON.stringify(obtenerRecientes_(3), null, 2));
}

/* ============================ Migración al modelo del profesor ============================ */

/**
 * Ejecuta esta función UNA vez desde el editor (repetirla no daña nada):
 *  - crea Dim_state y Dim_sales_channel
 *  - agrega Direccion y sk_state_id a Dim_city
 *  - agrega dia_semana y dia_semana_num a Dim_Fecha y los calcula para todas las fechas
 *  - agrega time y sk_sales_channel_id a Fac; las ventas históricas quedan con canal 0 = "Sin dato"
 * Solo llena celdas vacías: no pisa lo que alguien ya haya escrito a mano.
 */
function actualizarModelo() {
  const ss = SpreadsheetApp.getActive();
  const tz = ss.getSpreadsheetTimeZone();

  // 1) Dim_state
  crearDimension_(ss, HOJAS.ESTADO, ['sk_state_id', 'nombre_estado'], [
    [1, 'Illinois'],
    [2, 'Texas'],
    [3, 'California'],
    [4, 'New York'],
    [5, 'Caldas'],
    [6, 'Antioquia'],
    [7, 'Risaralda'],
    [8, 'Valle del Cauca'],
  ]);

  // 2) Dim_sales_channel (SK 0 = miembro desconocido para las ventas viejas)
  crearDimension_(ss, HOJAS.CANAL, ['sk_sales_channel_id', 'nombre_canal'], [
    [0, 'Sin dato'],
    [1, 'En el local'],
    [2, 'Para llevar'],
    [3, 'Domicilio'],
  ]);

  // 3) Dim_city: Direccion + sk_state_id (llave foránea hacia Dim_state)
  const estadoPorCiudad = {
    chicago: 1, houston: 2, 'los angeles': 3, 'new york': 4,
    manizales: 5, medellin: 6, 'pereira dosquebradas': 7, cartago: 8,
  };
  const direccionPorCiudad = { // direcciones de ejemplo: se pueden cambiar en la hoja
    chicago: '233 S Wacker Dr, Chicago, IL',
    houston: '1001 Fannin St, Houston, TX',
    'los angeles': '600 Wilshire Blvd, Los Angeles, CA',
    'new york': '350 5th Ave, New York, NY',
    manizales: 'Cra. 23 #64-25, Manizales',
    medellin: 'Cra. 43A #1-50, Medellín',
    'pereira dosquebradas': 'Av. Simón Bolívar #36-52, Dosquebradas',
    cartago: 'Cra. 4 #10-30, Cartago',
  };
  asegurarColumnas_(HOJAS.CIUDAD, ['Direccion', 'sk_state_id']);
  rellenarColumna_(HOJAS.CIUDAD, 'Direccion', function (f) { return direccionPorCiudad[clave_(f.Descripcion)] || ''; });
  rellenarColumna_(HOJAS.CIUDAD, 'sk_state_id', function (f) { return estadoPorCiudad[clave_(f.Descripcion)] || ''; });

  // 4) Dim_Fecha: nombre (y número) del día de la semana
  asegurarColumnas_(HOJAS.FECHA, ['dia_semana', 'dia_semana_num']);
  rellenarColumna_(HOJAS.FECHA, 'dia_semana', function (f) { return f.date === '' ? '' : diaSemana_(aTextoFecha_(f.date, tz)).nombre; });
  rellenarColumna_(HOJAS.FECHA, 'dia_semana_num', function (f) { return f.date === '' ? '' : diaSemana_(aTextoFecha_(f.date, tz)).num; });

  // 5) Fac: time + sk_sales_channel_id (las ventas viejas no tienen hora ni canal)
  asegurarColumnas_(HOJAS.FAC, ['time', 'sk_sales_channel_id']);
  const cambios = rellenarColumna_(HOJAS.FAC, 'sk_sales_channel_id', function (f) {
    return f.order_id === '' ? '' : SK_CANAL_SIN_DATO;
  });
  const fac = leerTabla_(HOJAS.FAC, { soloEncabezados: true });
  if (fac.hoja.getLastRow() >= 2) fac.hoja.getRange(2, fac.col.time, fac.hoja.getLastRow() - 1, 1).setNumberFormat('HH:mm:ss');

  SpreadsheetApp.flush();
  Logger.log('Modelo actualizado. Fac: %s filas históricas quedaron con sk_sales_channel_id = 0', cambios);
}

function crearDimension_(ss, nombre, encabezados, filas) {
  let hoja = ss.getSheetByName(nombre);
  if (!hoja) hoja = ss.insertSheet(nombre);
  if (hoja.getLastRow() > 0) return; // ya existe con datos: no se toca
  hoja.getRange(1, 1, 1, encabezados.length).setValues([encabezados]).setFontWeight('bold');
  hoja.getRange(2, 1, filas.length, encabezados.length).setValues(filas);
  hoja.setFrozenRows(1);
}

/** Agrega al final de la fila 1 los encabezados que falten. */
function asegurarColumnas_(nombre, nuevas) {
  const t = leerTabla_(nombre, { soloEncabezados: true });
  const faltan = nuevas.filter(function (h) { return !t.col[h]; });
  if (!faltan.length) return;
  t.hoja.getRange(1, t.hoja.getLastColumn() + 1, 1, faltan.length).setValues([faltan]).setFontWeight('bold');
}

/** Llena solo las celdas vacías de una columna, fila por fila. Devuelve cuántas llenó. */
function rellenarColumna_(nombre, encabezado, calcular) {
  const t = leerTabla_(nombre, { soloEncabezados: true });
  const ultima = t.hoja.getLastRow();
  if (ultima < 2) return 0;
  const datos = t.hoja.getRange(2, 1, ultima - 1, t.encabezados.length).getValues();
  const idx = t.col[encabezado] - 1;
  let n = 0;
  const salida = datos.map(function (r) {
    if (r[idx] !== '' || r.every(function (v) { return v === ''; })) return [r[idx]];
    const o = {};
    t.encabezados.forEach(function (h, i) { if (h) o[h] = r[i]; });
    const v = calcular(o);
    if (v !== '') n++;
    return [v];
  });
  t.hoja.getRange(2, idx + 1, salida.length, 1).setValues(salida);
  return n;
}

function clave_(s) {
  return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
