# Admin materiales

App Next.js para listar y editar materiales contra tu API. Los scrapers son scripts aparte: bajan HTML público, parsean precios y escriben JSON en `scripts/output/` (no actualizan la API solos).

## Requisitos

- Node.js (LTS recomendado)
- Desde la raíz del repo: `npm install`

## Scrapers de precios

Ejecutar **siempre desde la raíz** del proyecto. Usan `fetch` + Cheerio; pueden tardar mucho en modo `all`.

| Origen | Comando npm | Argumento extra (`tsx scripts/...`) |
|--------|-------------|--------------------------------------|
| **Alumetal** | `npm run scrape:alumetal` | Sin argumento = recorrido completo. `test` = una categoría de prueba. `categories` = lista categorías + CSV de mapeo. |
| **Todo Proyectable** | `npm run scrape:todoproyectable` | Igual: por defecto `all`, `test` o `categories`. |
| **Edify** | `npm run scrape:edify` | El script por defecto es `categories` si no pasás nada; el script de npm ya pasa `all`. También: `test`, `categories`. |
| **Materiales Moreno** | `npm run scrape:moreno` | `all` = catálogo por categorías. `test` = una categoría de prueba. `categories` = lista + CSV de mapeo. |

Atajos definidos en `package.json`:

```bash
npm run scrape:alumetal
npm run scrape:alumetal:test
npm run scrape:alumetal:categories

npm run scrape:todoproyectable
npm run scrape:todoproyectable:test
npm run scrape:todoproyectable:categories

npm run scrape:edify
npm run scrape:edify:test
npm run scrape:edify:categories

npm run scrape:moreno
npm run scrape:moreno:test
npm run scrape:moreno:categories
```

Equivalente manual (misma cosa que los scripts de npm):

```bash
npx tsx scripts/scrape-alumetal.ts
npx tsx scripts/scrape-alumetal.ts test
npx tsx scripts/scrape-alumetal.ts categories
```

(Análogo con `scrape-todoproyectable.ts`, `scrape-edify.ts` y `scrape-materiales-moreno.ts`; para Edify recordá `all` si querés scrape completo: `npx tsx scripts/scrape-edify.ts all`.)

## Salida

Todo cae en **`scripts/output/`**, por ejemplo:

- Alumetal: `alumetal-products-raw.json`, `alumetal-materials.json` (+ categorías/mapping si corrés `categories`).
- Todo Proyectable: `todoproyectable-products-raw.json`, `todoproyectable-materials.json`.
- Edify: `edify-products-raw.json`, `edify-materials.json`.
- Materiales Moreno: `moreno-products-raw.json`, `moreno-materials.json` (+ `moreno-categories.json` / `moreno-category-mapping.csv` en `categories`).

Los JSON “materials” están pensados para importar o contrastar con tu flujo (p. ej. chunk en la app). Los mapeos de categoría viven en `scripts/` (`*-category-mapping.json` / `.csv`) según cada scraper; Moreno puede usar `scripts/moreno-category-map.ts` o `scripts/output/moreno-category-mapping.csv` editado.

## App web

```bash
npm run dev
```

Variables de entorno: ver `.env.local` / `config/api.ts` para la URL de la API y rutas.
