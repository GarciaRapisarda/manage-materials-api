import * as fs from "fs";
import * as path from "path";
import * as cheerio from "cheerio";
import { EDIFY_BASE, DELAY_MS } from "./edify-category-map";
import { loadEdifyMapping } from "./load-edify-mapping";

interface EdifyCategory {
  slug: string;
  name: string;
  url: string;
  mappedTo?: string;
}

interface EdifyProduct {
  name: string;
  price: number;
  url: string;
  productId: string;
  categorySlug: string;
  categoryMapped: string;
  brand: string | null;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "es-419,es;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

const NON_CATEGORY_SLUGS = new Set([
  "productos", "contacto", "sucursales", "inicio", "atencion-al-cliente",
  "quienes-somos", "preguntas-frecuentes", "como-comprar", "politica-de-devolucion",
  "club-de-los-instaladores", "mi-cuenta", "carrito", "checkout", "guia-de-durleros-corrientes-capital",
]);

function slugFromHref(href: string): string | null {
  if (!href || href.includes("/productos/")) return null;
  try {
    const pathname = href.startsWith("http") ? new URL(href).pathname : href;
    const clean = pathname.replace(/^\//, "").replace(/\/$/, "");
    if (!clean || clean.includes("productos")) return null;
    if (NON_CATEGORY_SLUGS.has(clean.split("/")[0])) return null;
    if (!/^[a-z0-9][a-z0-9-]*(?:\/[a-z0-9-]+)?$/i.test(clean)) return null;
    return clean;
  } catch {
    return null;
  }
}

function extractMainCategories(html: string): { slug: string; name: string }[] {
  const $ = cheerio.load(html);
  const list: { slug: string; name: string }[] = [];
  const seen = new Set<string>();

  $('a[href*="tienda.edify.com.ar"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const slug = slugFromHref(href);
    if (!slug || seen.has(slug)) return;
    const parts = slug.split("/");
    if (parts.length > 1) return;
    const name = $(el).text().trim();
    if (!name || name.length > 80) return;
    seen.add(slug);
    list.push({ slug, name });
  });

  return list;
}

function extractSubcategories(
  html: string,
  parentSlug: string
): { slug: string; name: string }[] {
  const $ = cheerio.load(html);
  const list: { slug: string; name: string }[] = [];
  const seen = new Set<string>();

  $('a[href*="tienda.edify.com.ar"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const slug = slugFromHref(href);
    if (!slug || seen.has(slug)) return;
    if (!slug.startsWith(parentSlug + "/") || slug === parentSlug) return;
    const parts = slug.split("/");
    if (parts.length !== 2) return;
    const name = $(el).text().trim();
    if (!name || name.length > 80) return;
    seen.add(slug);
    list.push({ slug, name });
  });

  return list;
}

async function fetchAllCategories(): Promise<EdifyCategory[]> {
  const defaultMap = await import("./edify-category-map").then(
    (m) => m.CATEGORY_MAP
  );
  const productosUrl = `${EDIFY_BASE}/productos/`;
  console.log("Fetching main categories from:", productosUrl);
  const productosHtml = await fetchHtml(productosUrl);
  const mainCats = extractMainCategories(productosHtml);

  const all: EdifyCategory[] = [];
  const addedSlugs = new Set<string>();

  for (const main of mainCats) {
    if (addedSlugs.has(main.slug)) continue;
    addedSlugs.add(main.slug);
    all.push({
      slug: main.slug,
      name: main.name,
      url: `${EDIFY_BASE}/${main.slug}/`,
      mappedTo: defaultMap[main.slug],
    });

    const categoryUrl = `${EDIFY_BASE}/${main.slug}/`;
    console.log("  Fetching subcategories:", categoryUrl);
    await delay(DELAY_MS);
    const catHtml = await fetchHtml(categoryUrl);
    const subCats = extractSubcategories(catHtml, main.slug);

    for (const sub of subCats) {
      if (addedSlugs.has(sub.slug)) continue;
      addedSlugs.add(sub.slug);
      all.push({
        slug: sub.slug,
        name: sub.name,
        url: `${EDIFY_BASE}/${sub.slug}/`,
        mappedTo: defaultMap[sub.slug],
      });
    }
  }

  all.sort((a, b) => a.slug.localeCompare(b.slug));
  return all;
}

function extractProductsFromHtml(
  html: string,
  contextCategorySlug: string,
  categoryMap: Record<string, string>
): EdifyProduct[] {
  const categoryMapped =
    categoryMap[contextCategorySlug] ?? categoryMap[contextCategorySlug.split("/")[0]] ?? "Otros";

  const dataByProductId = new Map<string, { name: string; price: number; brand: string | null }>();
  const productIdRe = /"product_id":"(\d+)"/g;
  let idMatch;
  while ((idMatch = productIdRe.exec(html)) !== null) {
    const id = idMatch[1];
    const windowStart = idMatch.index;
    const windowEnd = Math.min(html.length, windowStart + 600);
    const window_ = html.slice(windowStart, windowEnd);
    const nameInWindow = window_.match(/"item_name":"((?:[^"\\]|\\.)*)"/);
    const priceInWindow = window_.match(/"price":(\d+(?:\.\d+)?)/);
    const brandInWindow = window_.match(/"item_brand":"((?:[^"\\]|\\.)*)"/);
    const name = nameInWindow ? nameInWindow[1].replace(/\\"/g, '"') : "";
    const price = priceInWindow ? parseFloat(priceInWindow[1]) : 0;
    const brand = brandInWindow && brandInWindow[1].trim() ? brandInWindow[1] : null;
    if (id && name && price > 0) {
      dataByProductId.set(id, { name, price, brand });
    }
  }

  if (dataByProductId.size === 0) {
    const nameRe = /"item_name":"((?:[^"\\]|\\.)*)"/g;
    const priceRe = /"price":(\d+(?:\.\d+)?)/g;
    const brandRe = /"item_brand":"((?:[^"\\]|\\.)*)"/g;
    const productIdRe = /"product_id":"(\d+)"/g;
    const names = [...html.matchAll(nameRe)].map((x) => x[1].replace(/\\"/g, '"'));
    const prices = [...html.matchAll(priceRe)].map((x) => parseFloat(x[1]));
    const brands = [...html.matchAll(brandRe)].map((x) => (x[1] && x[1].trim() ? x[1] : null));
    const productIds = [...html.matchAll(productIdRe)].map((x) => x[1]);
    for (let i = 0; i < productIds.length; i++) {
      const id = productIds[i];
      const price = prices[i] ?? 0;
      const name = names[i] ?? "";
      if (id && name && price > 0) {
        dataByProductId.set(id, { name, price, brand: brands[i] ?? null });
      }
    }
  }

  const names = [...html.matchAll(/"item_name":"((?:[^"\\]|\\.)*)"/g)].map((x) =>
    x[1].replace(/\\"/g, '"')
  );
  const prices = [...html.matchAll(/"price":(\d+(?:\.\d+)?)/g)].map((x) => parseFloat(x[1]));
  const brands = [...html.matchAll(/"item_brand":"((?:[^"\\]|\\.)*)"/g)].map((x) =>
    x[1] && x[1].trim() ? x[1] : null
  );
  const productIds = [...html.matchAll(/"product_id":"(\d+)"/g)].map((x) => x[1]);

  const $ = cheerio.load(html);
  const products: EdifyProduct[] = [];
  const seen = new Set<string>();

  $('a[href*="/productos/"]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href || !href.startsWith("https://tienda.edify.com.ar/productos/")) return;
    const url = href.replace(/#.*$/, "").replace(/\?.*$/, "").replace(/\/+$/, "") || href;
    if (seen.has(url)) return;

    const $cardWithId = $(el).closest("[data-product_id]");
    const $cardWithClass =
      $cardWithId.length > 0 ? $cardWithId : $(el).closest("li.product, .type-product");
    const productIdFromDom =
      $cardWithId.length > 0
        ? $cardWithId.attr("data-product_id") ?? $cardWithId.attr("data-product-id") ?? null
        : (() => {
            const cls = $cardWithClass.attr("class") ?? "";
            const postMatch = cls.match(/\bpost-(\d+)\b/);
            return postMatch ? postMatch[1] : null;
          })();

    const data = productIdFromDom ? dataByProductId.get(productIdFromDom) : null;

    if (data && productIdFromDom) {
      seen.add(url);
      products.push({
        name: data.name,
        price: data.price,
        url,
        productId: productIdFromDom,
        categorySlug: contextCategorySlug,
        categoryMapped,
        brand: data.brand,
      });
    }
  });

  if (products.length === 0 && names.length > 0) {
    const linkRe = /href="(https:\/\/tienda\.edify\.com\.ar\/productos\/[^"]+)"/g;
    const links: string[] = [];
    let match;
    while ((match = linkRe.exec(html)) !== null) links.push(match[1]);
    for (let i = 0; i < Math.min(links.length, names.length); i++) {
      const price = prices[i] ?? 0;
      if (price <= 0) continue;
      const url = links[i];
      if (!url || seen.has(url)) continue;
      seen.add(url);
      products.push({
        name: names[i],
        price,
        url,
        productId: productIds[i] ?? url.replace(/.*\/productos\/([^/]+)\/?.*/, "$1"),
        categorySlug: contextCategorySlug,
        categoryMapped,
        brand: brands[i] ?? null,
      });
    }
  }

  return products;
}

function getTotalPages(html: string, basePath: string): number {
  const pageLinks = html.match(/href="[^"]*\/page\/(\d+)\/[^"]*"/g);
  if (!pageLinks) return 1;
  let max = 1;
  for (const link of pageLinks) {
    const n = link.match(/\/page\/(\d+)\//);
    if (n) max = Math.max(max, parseInt(n[1], 10));
  }
  return max;
}

async function scrapeByCategory(
  categorySlug: string,
  categoryName: string,
  categoryMap: Record<string, string>
): Promise<EdifyProduct[]> {
  const all: EdifyProduct[] = [];
  const baseUrl = `${EDIFY_BASE}/${categorySlug}`;
  let page = 1;
  let totalPages = 1;

  while (true) {
    const url = page === 1 ? `${baseUrl}/` : `${baseUrl}/page/${page}/`;
    console.log("  ", url);

    const html = await fetchHtml(url);

    if (page === 1) totalPages = getTotalPages(html, baseUrl);

    const batch = extractProductsFromHtml(html, categorySlug, categoryMap);
    all.push(...batch);

    if (page >= totalPages || batch.length === 0) break;
    page++;
    await delay(DELAY_MS);
  }

  return all;
}

async function scrapeAllCategories(
  categoryMap: Record<string, string>
): Promise<EdifyProduct[]> {
  const categories = await fetchAllCategories();
  const seen = new Set<string>();
  const all: EdifyProduct[] = [];

  for (const cat of categories) {
    console.log(`\n${cat.name} (${cat.slug})`);
    const products = await scrapeByCategory(cat.slug, cat.name, categoryMap);
    for (const p of products) {
      if (!seen.has(p.url)) {
        seen.add(p.url);
        all.push(p);
      }
    }
    await delay(DELAY_MS);
  }

  return all;
}

function toMaterialsFormat(products: EdifyProduct[]) {
  const now = new Date().toISOString();
  return products.map((p) => ({
    name: p.name,
    description: "",
    price: p.price,
    unit: "u",
    brand: p.brand,
    unquoted: false,
    temporary: false,
    sourceCategory: p.categoryMapped,
    sourceUrl: p.url,
    sourceProductId: p.productId,
    scrapedAt: now,
  }));
}

async function main() {
  const mode = process.argv[2] || "categories";

  console.log("Edify tienda");
  console.log("Mode:", mode);

  const outputDir = path.join(process.cwd(), "scripts", "output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (mode === "categories") {
    const categories = await fetchAllCategories();
    const categoriesPath = path.join(outputDir, "edify-categories.json");
    const mappingCsvPath = path.join(outputDir, "edify-category-mapping.csv");
    fs.writeFileSync(
      categoriesPath,
      JSON.stringify(categories, null, 2),
      "utf-8"
    );
    const csvLines = [
      "slug,name,myCategory",
      ...categories.map(
        (c) =>
          `"${c.slug}","${c.name.replace(/"/g, '""')}","${(c.mappedTo ?? "").replace(/"/g, '""')}"`
      ),
    ];
    fs.writeFileSync(mappingCsvPath, csvLines.join("\n"), "utf-8");
    console.log(`\nDone. ${categories.length} categories.`);
    console.log(`Categories: ${categoriesPath}`);
    console.log(`Mapping (edit myCategory): ${mappingCsvPath}`);
    return;
  }

  const categoryMap = loadEdifyMapping();
  console.log("Using mapping: edify-category-mapping.json or .csv");

  let products: EdifyProduct[] = [];

  if (mode === "test") {
    const slug = "metalurgico/chapas-galvanizadas";
    const url = `${EDIFY_BASE}/${slug}/`;
    console.log("Test:", url);
    const html = await fetchHtml(url);
    products = extractProductsFromHtml(html, slug, categoryMap);
    console.log(`Parsed ${products.length} products`);
  } else {
    products = await scrapeAllCategories(categoryMap);
  }

  const rawPath = path.join(outputDir, "edify-products-raw.json");
  const materialsPath = path.join(outputDir, "edify-materials.json");
  fs.writeFileSync(rawPath, JSON.stringify(products, null, 2), "utf-8");
  fs.writeFileSync(
    materialsPath,
    JSON.stringify(toMaterialsFormat(products), null, 2),
    "utf-8"
  );
  console.log(`\nDone. ${products.length} products.`);
  console.log(`Raw: ${rawPath}`);
  console.log(`Materials: ${materialsPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
