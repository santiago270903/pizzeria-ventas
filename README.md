# Pizzería · Ventas → Google Sheets → Power BI

Front en React para registrar ventas, backend en Google Apps Script y Google Sheets como base de datos.
Power BI lee el mismo Google Sheets, así que al darle **Actualizar** aparecen las ventas nuevas.

```
 [ React (Render / Netlify) ]  --POST pedido-->  [ Apps Script (Web App) ]  --escribe-->  [ Google Sheets ]
                               <--menú, ciudades--                                              |
                                                                                    Power BI lee y "Actualizar"
```

## Contenido de la carpeta

| Ruta | Qué es |
|---|---|
| `Pizza.xlsx` | Datos originales (modelo estrella). Solo en la carpeta local, no se sube al repositorio: la base de datos real es el Google Sheets. |
| `apps-script/Code.gs` | Backend: lee el menú y escribe las ventas en la hoja `Fac`. |
| `apps-script/appsscript.json` | Manifiesto (zona horaria, acceso de la Web App). |
| `frontend/` | App React (Vite). |
| `render.yaml` / `netlify.toml` | Configuración de despliegue. |

---

## Paso 1 — Subir el Excel a Google Sheets

1. Entra a [drive.google.com](https://drive.google.com) → **Nuevo → Subir archivo** → `Pizza.xlsx`.
2. Clic derecho sobre el archivo → **Abrir con → Hojas de cálculo de Google**.
3. **Archivo → Guardar como Hojas de cálculo de Google**. A partir de aquí trabaja con *esa* copia (la que tiene el ícono verde, no la `.xlsx`).
4. **Archivo → Configuración → Zona horaria**: `(GMT-05:00) Bogotá`.
5. Verifica que existan las 5 hojas con estos nombres exactos: `Fac`, `Dim_Fecha`, `Dim_city`, `Dim_pizza`, `Dim_pizza_types`.

## Paso 2 — Backend con Apps Script

1. En el Google Sheets: **Extensiones → Apps Script**.
2. Borra lo que haya en `Código.gs` y pega todo el contenido de `apps-script/Code.gs`.
3. ⚙️ **Configuración del proyecto** → activa *“Mostrar el archivo de manifiesto appsscript.json”* → vuelve al editor y reemplaza `appsscript.json` con el de esta carpeta.
4. Selecciona la función `probarCatalogo` y dale **Ejecutar**. Google pedirá permisos (es tu propio script → *Configuración avanzada → Ir a … (no seguro)* → Permitir). En el registro debe salir algo como `Pizzas: 33 | Ciudades: 8`.
5. **Implementar → Nueva implementación** → tipo **Aplicación web**:
   - *Ejecutar como*: **Yo**
   - *Quién tiene acceso*: **Cualquier persona**
6. Copia la URL que termina en **`/exec`**. Pruébala en el navegador agregando `?action=ping` → debe responder `{"ok":true,...}`.

> Si cambias el código después: **Implementar → Gestionar implementaciones → ✏️ → Versión: Nueva versión**. Así la URL `/exec` no cambia.

### Qué hace el backend al registrar una venta

1. Valida ciudad, pizzas y cantidades (1 a 50 por ítem, para evitar registros como `quantity = 10000`).
2. Toma un **candado** (`LockService`) para que si dos compañeros registran a la vez no se repitan los IDs.
3. Busca la fecha en `Dim_Fecha`. Si existe usa su `sk_date`; si no, **crea la fila con una SK nueva** (`max + 1`) y calcula mes, trimestre, semestre y año.
4. Calcula `order_id = max + 1` y `order_details_id = max + 1, +2, …`.
5. Agrega **una fila en `Fac` por cada pizza** del pedido, con las mismas columnas que ya existen.

## Paso 3 — Probar el frontend en tu PC

```bash
cd frontend
npm install
```

Copia `frontend/.env.example` como `frontend/.env` y pega tu URL:

```
VITE_API_URL=https://script.google.com/macros/s/XXXXXXXX/exec
```

```bash
npm run dev
```

Abre http://localhost:5173. Arriba a la derecha debe decir **“Google Sheets”** con un punto verde.
Sin `.env` (o con una URL mala) la app muestra un error y no carga el menú: todo sale del Google Sheets real.

## Paso 4 — Desplegar

Primero sube la carpeta a un repositorio de GitHub (el `.gitignore` ya excluye `node_modules`, `dist` y `.env`).

**Opción A · Render** (sitio estático gratis)
1. [dashboard.render.com](https://dashboard.render.com) → **New → Blueprint** → elige el repo (usa `render.yaml`).
   *O bien* **New → Static Site** con: Root Directory `frontend`, Build Command `npm install && npm run build`, Publish Directory `dist`.
2. En **Environment** agrega `VITE_API_URL` = tu URL `/exec`.
3. **Manual Deploy → Clear build cache & deploy**.

**Opción B · Netlify**
1. [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project** → elige el repo (lee `netlify.toml`).
2. **Site configuration → Environment variables** → `VITE_API_URL`.
3. **Deploys → Trigger deploy**.

> ⚠️ `VITE_API_URL` se “hornea” al compilar. Si la cambias, hay que volver a desplegar.

## Paso 5 — Conectar Power BI al Google Sheets

No hace falta SQL en el medio: Power BI se conecta directo al Google Sheets.

**Opción A · Conector de Google Sheets** (lo más simple en Power BI Desktop)
1. **Obtener datos → Más… → Google Sheets** → pega la URL del Google Sheets → inicia sesión con tu cuenta de Google.
2. Marca las 5 hojas → **Transformar datos**.

**Opción B · Conector Web** (recomendado si vas a publicar en Power BI Service con actualización programada)
1. En el Google Sheets: **Compartir → Cualquier persona con el enlace → Lector**.
2. Power BI: **Obtener datos → Web** con
   `https://docs.google.com/spreadsheets/d/ID_DEL_ARCHIVO/export?format=xlsx`
   (el ID es lo que está entre `/d/` y `/edit` en la URL) → autenticación **Anónima**.
3. Marca las 5 hojas → **Transformar datos**.
   *Ojo: con esta opción cualquiera con el enlace puede ver los datos.*

### En Power Query
- Verifica *“Usar la primera fila como encabezado”* en cada tabla.
- Tipos: `price` → Número decimal (hay un precio guardado como texto), `date` → Fecha, todas las `sk_*`, `order_id`, `quantity` → Número entero.

### Relaciones (vista de Modelo)

| Desde (muchos) | Hacia (uno) |
|---|---|
| `Fac[sk_date]` | `Dim_Fecha[sk_date]` |
| `Fac[sk_city_id]` | `Dim_city[sk_city_id]` |
| `Fac[pizza_id]` | `Dim_pizza[pizza_id]` |
| `Dim_pizza[pizza_type_id]` | `Dim_pizza_types[pizza_type_id]` |

### Medidas DAX sugeridas

```DAX
Ventas = SUMX ( Fac, Fac[quantity] * RELATED ( Dim_pizza[price] ) )
Pedidos = DISTINCTCOUNT ( Fac[order_id] )
Pizzas vendidas = SUM ( Fac[quantity] )
Ticket promedio = DIVIDE ( [Ventas], [Pedidos] )
```

### Ver los datos nuevos
Registra una venta en el front → en Power BI Desktop clic en **Inicio → Actualizar**.
En Power BI Service: **Configuración del modelo semántico → Actualización programada** (o “Actualizar ahora”).

---

## ¿Qué es una SK? (para explicarlo)

**SK = *Surrogate Key* = llave subrogada (o sustituta).** En las notas aparece como “llave secundaria”, pero el término correcto en bodegas de datos es *subrogada*.

- **Llave natural**: el identificador que viene del negocio. Ej.: `pizza_id = "hawaiian_m"`, o la fecha `2023-01-01`, o el nombre `"Chicago"`.
- **Llave subrogada (SK)**: un número entero **inventado por el modelo**, sin significado de negocio, que identifica cada fila de una dimensión. Ej.: `sk_city_id = 1` para Chicago, `sk_date = 1` para el 01/01/2023.

**Cómo se usan en este modelo estrella**
- Cada dimensión tiene su SK como **llave primaria** (`Dim_city.sk_city_id`, `Dim_Fecha.sk_date`, `Dim_pizza.sk_id_pizza`, `Dim_pizza_types.sk_pizza_type_id`).
- La tabla de hechos `Fac` guarda esas SK como **llaves foráneas** (`Fac.sk_city_id`, `Fac.sk_date`) en lugar de guardar el texto o la fecha.

**¿Por qué usarlas?**
1. **Rendimiento**: unir por enteros pequeños es más rápido y ocupa menos que unir por textos.
2. **Independencia del origen**: si el sistema fuente cambia un código (`"hawaiian_m"` → `"haw_m"`), la SK no cambia y el histórico no se rompe.
3. **Historial (SCD tipo 2)**: si cambia un dato de la dimensión (por ejemplo el precio de una pizza), se puede crear una fila nueva con otra SK y conservar la anterior; las ventas viejas siguen apuntando al precio viejo.
4. **Miembros especiales**: se puede reservar, por ejemplo, `sk = 0` para “Desconocido / Sin fecha”.

**Ejemplo en vivo con la app**: cuando registras una venta con una fecha que no existe en `Dim_Fecha`, el backend crea la fila con `sk_date = max + 1` y esa misma SK se escribe en `Fac`. La ventana de confirmación muestra qué SK se usó y si fue nueva o existente.

> Detalle del modelo actual: `Fac` se relaciona con `Dim_pizza` por la **llave natural** `pizza_id`, no por la SK `sk_id_pizza`. Funciona, pero lo “de libro” sería guardar `sk_id_pizza` en la tabla de hechos.

---

## ⚠️ Problemas que encontré en los datos (revisar antes del tablero)

| # | Problema | Impacto en Power BI |
|---|---|---|
| 1 | **48.261 de 48.630 filas de `Fac` no tienen `sk_date`** (vacío). Las primeras 360 tienen `sk_date` = 1, 2, 3… igual al número de fila, no a la fecha real del pedido. | Cualquier gráfico por fecha/mes saldrá casi vacío o en “(En blanco)”. |
| 2 | En `Dim_Fecha` la misma fecha aparece con varias SK (02/05/2026 tiene 9 SK: 361–369; 04/05/2026 tiene 3). | No rompe la relación, pero no es lo ideal: una fecha = una SK. La app reutiliza la primera que encuentre. |
| 3 | `order_id` 502–511 se repiten con pedidos originales (los IDs originales llegan hasta 21350). | `Pedidos` (conteo distinto) queda inflado/mezclado. La app usa `max + 1`, así que no vuelve a pasar. |
| 4 | Datos de prueba: `quantity = 10000` (pedido 509), `bbq_ckn_l_test`, tipos `efefe` / `sssss`, `gbg-hgj`, `pureba_jai`. | Distorsionan totales. La app limita la cantidad a 50. |
| 5 | `carne_m` tiene tamaño `S` y el precio guardado como texto `"14.99"`. | Cambiar tipo a decimal en Power Query. |
| 6 | `bbq_ckn` no tiene nombre ni categoría en `Dim_pizza_types`. | Sale en blanco en los gráficos; la app lo muestra como “Bbq Ckn” en la categoría “Otras”. |
