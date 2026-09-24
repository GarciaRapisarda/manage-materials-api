# Admin materiales

App Next.js para listar y editar materiales contra tu API. Los scrapers son scripts aparte: bajan HTML público, parsean precios y escriben JSON en `scripts/output/` (no actualizan la API solos).

## Próxima actualización de precios

El mapeo de categorías ya está hecho. No hace falta `--refresh-categories` salvo que una tienda haya cambiado el menú. La revisión de nombres (`npm run names:review`) no entra en este recorrido: es una pasada aparte, a mano, cuando el catálogo ya está sucio.

1. **Bajar precios**

```bash
npm run scrape:all
```

Recorre Alumetal, Todo Proyectable, Edify, Moreno, Merlino y Ropelato. Actualiza `scripts/output/last-update.json`. No escribe en la API.

2. **Entrar a la app** (`npm run dev`), iniciar sesión, y en **Importar materiales** usar **Cargar plan** de cada tienda. No pisa nada todavía.

3. **Leer el resumen del plan**

| Marca | Qué hacer |
|-------|-----------|
| Actualizar | Precio nuevo parecido al actual. Viene marcado. **Ejecutar** lo aplica. |
| Crear | El nombre no existe. Viene marcado. Se guarda con el nombre limpio (sin guión ni coma suelta). |
| Sin cambios | Mismo precio. No hace falta ejecutarlo; si se ejecuta, solo anota el id de la tienda. |
| Precio raro | El nuevo es el doble o menos de la mitad. No viene marcado y **Ejecutar no lo pisa**. |
| Nombre distinto | El mismo id de tienda cambió de color, medida, mano, calidad o código (C-28 contra CC-28). No se actualiza. |

4. **Ejecutar** los marcados. Precios y altas van de a 8. Si un precio falla, se corta y no sigue con las altas. Los que salieron bien quedan enlazados en `scripts/output/source-links.json` (`tienda:idDeLaTienda` → id del material). La próxima corrida de esa tienda actualiza esa ficha aunque el nombre traiga un guión de más.

5. **Anotar con modelo**, solo si hay filas en "Precio raro" o "Nombre distinto". Escribe `scripts/output/import-anomalies-<fecha>.json` con una nota. No borra ni renombra. Esas filas se miran a mano.

Opcional, antes del paso 2, el mismo conteo por consola:

```bash
npm run analyze:import -- scripts/output/ropelato-materials-all.json
```

La línea `Para revisar` son los precios raros y los nombres distintos. Si dice `con LLM: 0`, las altas no gastan categorización.

Cada JSON de tienda trae `sourceProductId`. La primera vez que un nombre coincide, se guarda el enlace. Un precio que salta no se enlaza ni se escribe, así que no vuelve a pisar el precio bueno.

## Requisitos

- Node.js (LTS recomendado)
- Desde la raíz del repo: `npm install`

## Flujo estándar de scrapers

Este es el flujo que usamos **siempre** al sumar o correr un origen nuevo. La idea es no mapear categorías a mano ni dejar que el LLM categorice miles de productos uno por uno sin contexto.

### Dos capas de categorización

| Capa | Cuándo | Qué hace | Escala |
|------|--------|----------|--------|
| **Mapeo de categorías** (previo al scrape) | Una vez por tienda | Cada categoría *hoja* de la tienda → nombre interno de tu catálogo (ej. `Hierros, Mallas, Alambres…`) | ~200 categorías en ~8–10 llamadas LLM en lotes |
| **Categorización por material** (import en la app) | Al subir el JSON en la UI | Por producto: nombre + `sourceCategory` → `categoryId` + unidad | Lotes de ~15 productos |

El mapeo previo hace que cada ítem del JSON salga con `sourceCategory` ya alineado a tus categorías. En el import, el LLM afiná unidad y casos raros, pero no tiene que inferir todo desde cero.

### Pasos (plantilla para cualquier origen)

Sustituí `{origen}` por el nombre del scraper (`ropelato`, `merlino`, etc.).

1. **Descubrir categorías** de la tienda  
   `npm run scrape:{origen}:categories`  
   Genera `scripts/output/{origen}-categories.json` y `{origen}-category-mapping.csv` (columna `myCategory` vacía al inicio).

2. **Mapear categorías con LLM** (no editar el CSV a mano salvo excepciones)  
   `npm run map:{origen}:categories`  
   Lee las categorías *hoja* (`hasChildren=false`), las mapea contra `docs/categorias-llm-contexto.md` y escribe `scripts/{origen}-category-mapping.json` (y actualiza el CSV).  
   Requiere `OPENAI_API_KEY` en `.env.local`.  
   Opcional: `--force` para remapear todo (`npx tsx scripts/map-categories-llm.ts ropelato --force`).

3. **Verificar** cuántas quedaron listas  
   `npm run scrape:{origen}:mapping-check`  
   Debe mostrar ~todas las hojas con `myCategory`, no solo 2–3 filas de prueba.

4. **Scrapear** el catálogo  
   `npm run scrape:{origen}:test` (una categoría, prueba rápida) → `npm run scrape:{origen}` (completo).  
   Solo recorre hojas con `myCategory` definido. **No saltear el paso 2**: si corrés el scrape sin mapeo, vas a ver pocas categorías y pocos productos.

5. **Importar** en la app  
   Subir `scripts/output/{origen}-materials-all.json` en la sección de import por chunk. Si `sourceCategory` ya es tu categoría interna (mapeo del paso 2), la app asigna `categoryId` sin LLM; el LLM solo corre para ítems sin contexto o chunks de texto pegado. Unidad y reglas por nombre (cemento, m2, etc.) se aplican igual sin llamar al modelo.

### Reglas al mapear y scrapear

- Scrapear solo categorías **hoja** (sin hijos en el árbol de la tienda). Las categorías padre duplican productos.
- Los nombres en `myCategory` deben coincidir con los de tu API / `docs/categorias-llm-contexto.md` (el script LLM usa esa lista cerrada).
- Orígenes viejos (Alumetal, Edify, etc.) pueden tener el mapeo ya en `scripts/*-category-map.ts`; los nuevos deberían usar `map:{origen}:categories` tras implementar el scraper con modo `categories`.

### Orígenes con mapeo LLM automático

| Origen | Descubrir | Mapear LLM | Scrape |
|--------|-----------|------------|--------|
| **Ropelato** | `scrape:ropelato:categories` | `map:ropelato:categories` | `scrape:ropelato` |
| **Merlino** | `scrape:merlino:categories` | `map:merlino:categories` | `scrape:merlino` |
| **Alumetal** | `scrape:alumetal:categories` | `map:alumetal:categories` | `scrape:alumetal` |
| **Todo Proyectable** | `scrape:todoproyectable:categories` | `map:todoproyectable:categories` | `scrape:todoproyectable` |
| **Edify** | `scrape:edify:categories` | `map:edify:categories` | `scrape:edify` |
| **Materiales Moreno** | `scrape:moreno:categories` | `map:moreno:categories` | `scrape:moreno` |

Pendientes/dudosos en un solo comando: `npm run map:categories:pending` (Merlino, Edify, Moreno, Todo Proyectable). Remapear todo: agregar `--force`.

Al agregar un scraper nuevo, registrar el origen en `scripts/map-categories-llm.ts` y exponer `map:{origen}:categories`.

Para el agente de Cursor: convenciones detalladas en `.cursor/rules/scraper-automation.mdc`.

---

## Scrapers de precios

Ejecutar **siempre desde la raíz** del proyecto. Usan `fetch` + Cheerio. El modo `all` puede tardar mucho.

| Origen | Scrape completo | Notas |
|--------|-----------------|-------|
| **Alumetal** | `npm run scrape:alumetal` | Mapeo en `scripts/alumetal-category-map.ts`. `categories` / `test`. |
| **Todo Proyectable** | `npm run scrape:todoproyectable` | Igual patrón: `categories`, `test`, `all`. |
| **Edify** | `npm run scrape:edify` | `categories`, `test`, `all`. |
| **Materiales Moreno** | `npm run scrape:moreno` | `categories`, `test`, `all`. |
| **Merlino** | `npm run scrape:merlino` | Seguir [flujo estándar](#flujo-estándar-de-scrapers). VTEX. |
| **Ropelato** | `npm run scrape:ropelato` | Seguir [flujo estándar](#flujo-estándar-de-scrapers). PrestaShop. |

### Todas las tiendas

`scripts/scrape-all.ts` llama a los scrapers que ya existen. No reemplaza los comandos por origen.

```bash
npm run scrape:all
npm run scrape:all -- --refresh-categories
```

Sin flag: scrape completo (`all`) de Alumetal, Todo Proyectable, Edify, Moreno, Merlino y Ropelato, en ese orden. Sirve para actualizar precios cuando el mapeo de categorías ya está hecho.

`--refresh-categories`: en cada tienda, primero descubre categorías, después mapea con el LLM y recién ahí scrapea. El mapeo solo llama a OpenAI por categorías que todavía no tienen nombre interno válido (no remapea todo; para eso está `--force` en el script de un origen).

Si una tienda falla, sigue con la siguiente. Si falla en categorías o en el mapeo, no scrapea esa tienda. Al final imprime un resumen (`ok` o en qué paso falló) y sale con error si alguna falló.

El import a la API no entra en este comando. Sigue siendo el paso de la app (o `npm run analyze:import` antes).

Cada scrape completo actualiza `scripts/output/last-update.json` (fecha de la última corrida exitosa por tienda). Ver [Salida](#salida).

### Comandos npm (referencia)

```bash
# Todas las tiendas (precios). Con --refresh-categories también descubre y mapea.
npm run scrape:all
npm run scrape:all -- --refresh-categories

# Plantilla Ropelato / Merlino (flujo estándar)
npm run scrape:ropelato:categories
npm run map:ropelato:categories
npm run scrape:ropelato:mapping-check
npm run scrape:ropelato:test
npm run scrape:ropelato

npm run scrape:merlino:categories
npm run map:merlino:categories
npm run scrape:merlino:mapping-check
npm run scrape:merlino:test
npm run scrape:merlino

# Otros orígenes (+ mapeo LLM)
npm run scrape:alumetal:categories
npm run map:alumetal:categories
npm run scrape:alumetal

npm run scrape:todoproyectable:categories
npm run map:todoproyectable:categories
npm run scrape:todoproyectable

npm run scrape:edify:categories
npm run map:edify:categories
npm run scrape:edify

npm run scrape:moreno:categories
npm run map:moreno:categories
npm run scrape:moreno

npm run map:categories:pending
```

Equivalente manual: `npx tsx scripts/scrape-{origen}.ts [categories|mapping-check|test|all]`.

## Salida

Todo cae en **`scripts/output/`**, por ejemplo:

- Alumetal: `alumetal-products-raw.json`, `alumetal-materials.json` (+ categorías/mapping si corrés `categories`).
- Todo Proyectable: `todoproyectable-products-raw.json`, `todoproyectable-materials.json`.
- Edify: `edify-products-raw.json`, `edify-materials.json`.
- Materiales Moreno: `moreno-products-raw.json`, `moreno-materials.json` (+ `moreno-categories.json` / `moreno-category-mapping.csv` en `categories`).
- Merlino / Ropelato: `{origen}-categories.json`, `{origen}-category-mapping.csv`, mapeo final en `scripts/{origen}-category-mapping.json`; scrape: `{origen}-products-all.json`, `{origen}-materials-all.json`.

Los JSON `materials` se importan en la app. El mapeo de categorías vive en `scripts/{origen}-category-mapping.json` (generado por `map:{origen}:categories`) o, en orígenes legacy, en `scripts/*-category-map.ts`.

### Última actualización

Solo el scrape **completo** (`all`) escribe la fecha. `test` y `categories` no la pisan. Si una tienda falla, queda la fecha de la última corrida que sí terminó.

Un archivo por origen, misma forma:

`scripts/output/{origen}-last-update.json`

```json
{
  "source": "ropelato",
  "updatedAt": "2026-09-24T15:41:00.000Z",
  "productCount": 9000,
  "materialsFile": "ropelato-materials-all.json"
}
```

`updatedAt` es UTC. `materialsFile` es el JSON que se importa, en la misma carpeta.

`scripts/output/last-update.json` junta las seis tiendas. Cada scrape completo de un origen lo reescribe con la fecha nueva de esa tienda y conserva las demás.

```json
{
  "updatedAt": "2026-09-24T15:41:00.000Z",
  "sources": {
    "alumetal": { "source": "alumetal", "updatedAt": "...", "productCount": 0, "materialsFile": "alumetal-materials.json" },
    "ropelato": { "source": "ropelato", "updatedAt": "...", "productCount": 0, "materialsFile": "ropelato-materials-all.json" }
  }
}
```

Orígenes y archivo de materiales: Alumetal `alumetal-materials.json`, Todo Proyectable `todoproyectable-materials.json`, Edify `edify-materials.json`, Moreno `moreno-materials.json`, Merlino `merlino-materials-all.json`, Ropelato `ropelato-materials-all.json`.

## App web

```bash
npm run dev
```

Variables de entorno: ver `.env.local` / `config/api.ts` para la URL de la API y rutas.

**API Edify (listado en la app):**

| Uso | Método | Ruta |
|-----|--------|------|
| Categorías | `GET` | `{baseUrl}/category/all` |
| Materiales por categoría | `GET` | `{baseUrl}/category/materials/:categoryId?page=1&pageSize=50&q=` → una página por vez en la UI (Anterior / Siguiente). `q` = búsqueda por nombre/marca en el rubro. |
| Todos (solo import / comparar nombres) | `GET` | `{baseUrl}/materials/all` |

La tabla principal carga **una categoría a la vez**. Al importar JSON, la app pide `/materials/all` una sola vez para matchear nombres contra toda la base.

### Importar JSON grande (ej. Ropelato ~9000 ítems)

1. **Mapeo previo** (`npm run map:ropelato:categories`): el scrape guarda `sourceCategory` con el nombre interno de categoría (el mismo que devuelve `categories/all`). Así la importación no vuelve a gastar LLM por producto.
2. **Dry-run sin UI** (API local levantada):

```bash
npm run analyze:import -- scripts/output/ropelato-materials-all.json
```

Muestra altas con/sin LLM, actualizaciones, `Para revisar` (precio raro o nombre distinto) y `sourceCategory` sin match.

3. **En la app**, el recorrido de una actualización está en [Próxima actualización de precios](#próxima-actualización-de-precios). **Cargar plan** no escribe en la API. **Ejecutar** aplica altas y cambios de precio marcados. “Cargar desde JSON” sirve para un archivo elegido a mano; si el archivo no se cargó desde la lista de tiendas, no trae el nombre de la tienda y no se puede enlazar el `sourceProductId`. Si hay **≥ 400** filas y **createsNeedLlm > 0**, tenés que pulsar “Asignar categorías” a propósito; si **createsNeedLlm = 0**, asigna en local al instante.
4. La tabla previa muestra hasta **200** filas; **Ejecutar** aplica a todos los seleccionados que no estén en "Precio raro" o "Nombre distinto". Precios y altas van de a 8 en paralelo. Si un precio falla, no sigue con el resto ni con las altas.

Regla práctica: si `analyze:import` dice **0 con LLM**, podés importar los 9000 sin costo de categorización por producto.

### Duplicados en todo el catálogo

El botón de la página solo compara los 50 materiales visibles y exige el nombre idéntico. Para el catálogo completo:

```bash
npm run duplicates:review
```

Lee `/materials/all` con sesión (`EDIFY_USERNAME` y `EDIFY_PASSWORD` en `.env.local`), junta medidas equivalentes (`18 lt`, `x 18lt`) y no mezcla números distintos (`1lt` contra `18lt`, `15cm` contra `30cm`). Si el texto queda igual, es duplicado mecánico. Si sobra una palabra, lo decide `gpt-4.1` (`same`, `different`, `unsure`). `unsure` y `different` no se eliminan. Escribe `scripts/output/duplicate-review.json` y no borra nada.

En la app, **Revisión de duplicados** abre `/duplicados` y lee solo ese archivo (no vuelve a bajar el catálogo). Cada grupo muestra precio y fecha. El de `updated_at` más reciente arranca sin marcar y el resto marcado para borrar; se puede cambiar cuál se conserva. Al eliminar, el archivo se actualiza: al recargar no reaparecen. `npm run duplicates:review -- --sync` relee el catálogo, saca los ids que ya no existen y no llama al modelo. `--skip-llm` deja solo los grupos mecánicos.

### Nombres sucios

Esto no es el paso de cada actualización de precios. Sirve cuando el catálogo ya tiene el mismo producto escrito de dos formas y hay que elegir cuál borrar.

Al importar, el nombre se limpia antes de comparar: se sacan guiones y comas sueltas, y una frase repetida (`puesta en obra puesta en obra`). Fina y gruesa, y medidas distintas, siguen sin coincidir. El freno de precio y de identidad está en [Próxima actualización de precios](#próxima-actualización-de-precios).

La revisión con modelo es manual y no decide sola:

```bash
npm run names:review
```

Junta lo que queda idéntico tras esa limpieza y manda a `gpt-4.1` los parecidos (marca pegada al nombre, `x`, o un `1` que falta delante de la unidad). Escribe `scripts/output/name-review-<fecha>.json` y una copia en `name-review.json`. No borra ni renombra. `--skip-llm` deja solo los grupos mecánicos.

**Revisión de nombres** abre `/nombres`, lee solo ese archivo y muestra el nombre limpio. El más reciente arranca sin marcar. Al aplicar se elimina lo marcado y, si queda uno solo, pasa a llamarse con el nombre limpio.
