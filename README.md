# Admin materiales

App Next.js para listar y editar materiales contra tu API. Los scrapers son scripts aparte: bajan HTML público, parsean precios y escriben JSON en `scripts/output/` (no actualizan la API solos).

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

### Comandos npm (referencia)

```bash
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

## App web

```bash
npm run dev
```

Variables de entorno: ver `.env.local` / `config/api.ts` para la URL de la API y rutas.

**API Edify (listado en la app):**

| Uso | Método | Ruta |
|-----|--------|------|
| Categorías | `GET` | `{baseUrl}/category/all` |
| Materiales por categoría | `GET` | `{baseUrl}/category/materials/:categoryId` |
| Todos (solo import / comparar nombres) | `GET` | `{baseUrl}/materials/all` |

La tabla principal carga **una categoría a la vez**. Al importar JSON, la app pide `/materials/all` una sola vez para matchear nombres contra toda la base.

### Importar JSON grande (ej. Ropelato ~9000 ítems)

1. **Mapeo previo** (`npm run map:ropelato:categories`): el scrape guarda `sourceCategory` con el nombre interno de categoría (el mismo que devuelve `categories/all`). Así la importación no vuelve a gastar LLM por producto.
2. **Dry-run sin UI** (API local levantada):

```bash
npm run analyze:import -- scripts/output/ropelato-materials-all.json
```

Muestra cuántos altas son con/sin LLM, requests estimados y `sourceCategory` sin match.

3. **En la app**: “Cargar desde JSON” → caja **Plan de importación** antes del LLM. Si hay **≥ 400** filas y **createsNeedLlm > 0**, tenés que pulsar “Asignar categorías” a propósito; si **createsNeedLlm = 0**, asigna en local al instante.
4. La tabla previa muestra hasta **200** filas; **Ejecutar** aplica a todos los seleccionados (altas en paralelo, 8 a la vez).

Regla práctica: si `analyze:import` dice **0 con LLM**, podés importar los 9000 sin costo de categorización por producto.
