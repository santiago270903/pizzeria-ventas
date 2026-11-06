/**
 * Backend de la pizzería — Google Apps Script
 * ------------------------------------------------------------
 * Este script vive DENTRO del Google Sheets (Extensiones > Apps Script)
 * y se publica como "Aplicación web". El frontend en React le habla así:
 *
 *   GET  ?action=catalog      -> menú (pizzas + tamaños + precios) y ciudades
 *   GET  ?action=recent       -> últimos pedidos registrados
 *   GET  ?action=ping         -> prueba de conexión
 *   POST  { cityId, date, items:[{pizzaId, quantity}] }  -> registra una venta
 *
 * Respeta el modelo estrella que ya existe en el archivo:
 *   Fac (hechos) -> Dim_Fecha, Dim_city, Dim_pizza -> Dim_pizza_types
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
};

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
      .map(function (c) { return { id: Number(c.sk_city_id), name: String(c.Descripcion) }; }),
  };
}

/* ============================ Registrar venta ============================ */

function registrarPedido_(body) {
  // ---- Validación ----
  const cityId = Number(body.cityId);
  const items = Array.isArray(body.items) ? body.items : [];
  if (!cityId) throw new Error('Selecciona una ciudad');
  if (!items.length) throw new Error('El pedido no tiene pizzas');
  if (items.length > MAX_ITEMS_POR_PEDIDO) throw new Error('Máximo ' + MAX_ITEMS_POR_PEDIDO + ' ítems por pedido');

  const ciudades = leerTabla_(HOJAS.CIUDAD).filas;
  const ciudad = ciudades.filter(function (c) { return Number(c.sk_city_id) === cityId; })[0];
  if (!ciudad) throw new Error('La ciudad ' + cityId + ' no existe en Dim_city');

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

  // ---- Escritura protegida con candado (dos compañeros a la vez no chocan) ----
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const fecha = obtenerOCrearSkFecha_(fechaTxt, tz);

    const fac = leerTabla_(HOJAS.FAC, { soloEncabezados: true });
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
      };
      return fac.encabezados.map(function (h) { return h in valores ? valores[h] : ''; });
    });

    hoja.getRange(ultimaFila + 1, 1, filas.length, fac.encabezados.length).setValues(filas);
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
      city: String(ciudad.Descripcion),
      skCity: cityId,
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
  const valores = {
    sk_date: maxSk + 1,
    date: Utilities.parseDate(fechaTxt, tz, 'yyyy-MM-dd'),
    mes: mes,
    trimestre: Math.ceil(mes / 3),
    semestre: mes <= 6 ? 1 : 2,
    'año': partes[0],
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
