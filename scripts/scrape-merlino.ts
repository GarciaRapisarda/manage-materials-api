import * as fs from "fs";
import * as path from "path";
import * as cheerio from "cheerio";
import {
  MERLINO_BASE,
  MERLINO_CATEGORY_TREE_URL,
  CATEGORY_MAP,
  DELAY_MS,
} from "./merlino-category-map";
import { loadMerlinoMapping } from "./load-merlino-mapping";

interface ScrapedProduct {
  name: string;
  price: number;
  priceList: number | null;
  url: string;
  productId: string;
  brand: string | null;
  categoryMerlino: string;
  categoryMapped: string;
}

interface ScrapeTarget {
  slug: string;
  name: string;
  url: string;
  categoryMapped: string;
}

const TEST_CATEGORY_SLUG = "materiales-gruesos-de-construccion/aridos";

interface VtexCategoryNode {
  id: number;
  name: string;
  url?: string;
  children?: VtexCategoryNode[];
}

export interface MerlinoCategory {
  id: string;
  slug: string;
  name: string;
  parentSlug: string;
  depth: number;
  hasChildren: boolean;
  url: string;
  mappedTo?: string;
}

function slugFromUrl(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).pathname.replace(/^\//, "").replace(/\/$/, "");
  } catch {
    return "";
  }
}

function parentSlugFromSlug(slug: string): string {
  const i = slug.lastIndexOf("/");
  return i >= 0 ? slug.slice(0, i) : "";
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parsePrice(raw: string): number {
  const cleaned = raw.replace(/\s/g, "").replace(/[$\u00a0]/g, "");
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
}

function categoryBaseUrl(target: ScrapeTarget): string {
  if (target.url) {
    try {
      const u = new URL(target.url);
      return `${u.origin}${u.pathname}`.replace(/\/$/, "");
    } catch {
      // fall through
    }
  }
  return `${MERLINO_BASE}/${target.slug}`;
}

function categoryPageUrl(target: ScrapeTarget, page: number): string {
  const base = categoryBaseUrl(target);
  return page <= 1 ? base : `${base}?page=${page}`;
}

async function fetchCategoryHtml(url: string): Promise<string | null> {
  const retriable = new Set([429, 502, 503, 504]);

  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "es-AR,es;q=0.9",
      },
    });

    if (res.ok) return res.text();
    if (res.status === 404 || res.status === 410) return null;
    if (retriable.has(res.status) && attempt === 0) {
      await delay(DELAY_MS * 2);
      continue;
    }
    throw new Error(`HTTP ${res.status}: ${url}`);
  }

  return null;
}

function extractProductId(url: string, sku?: string): string {
  if (sku) return String(sku);
  const m = url.match(/\/([^/]+)\/p\/?$/i);
  return m ? m[1] : "";
}

function parseProductsFromHtml(
  html: string,
  categorySlug: string,
  categoryMapped: string
): ScrapedProduct[] {
  const $ = cheerio.load(html);
  const raw = $('script[type="application/ld+json"]')
    .toArray()
    .map((el) => $(el).html())
    .find((t) => t?.includes('"ItemList"'));
  if (!raw) return [];

  let data: { itemListElement?: { item?: Record<string, unknown> }[] };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    return [];
  }

  const products: ScrapedProduct[] = [];
  for (const entry of data.itemListElement ?? []) {
    const item = entry.item;
    if (!item || item["@type"] !== "Product") continue;

    const name = String(item.name ?? "").trim();
    const url = String(item["@id"] ?? item.url ?? "").trim();
    if (!name || !url) continue;

    const offers = item.offers as
      | { lowPrice?: number; highPrice?: number; offers?: { price?: number }[] }
      | undefined;
    let price = 0;
    let priceList: number | null = null;
    if (offers?.lowPrice != null) {
      price = Number(offers.lowPrice);
      const high = offers.highPrice != null ? Number(offers.highPrice) : null;
      if (high != null && high > price) priceList = high;
    } else if (offers?.offers?.[0]?.price != null) {
      price = Number(offers.offers[0].price);
    }
    if (price <= 0) continue;

    const brandObj = item.brand as { name?: string } | undefined;
    const brand = brandObj?.name?.trim() || null;
    const sku = String(
      (offers?.offers?.[0] as { sku?: string } | undefined)?.sku ??
        (item.sku as string | undefined) ??
        ""
    );

    products.push({
      name,
      price,
      priceList,
      url: url.split("?")[0],
      productId: extractProductId(url, sku),
      brand,
      categoryMerlino: categorySlug,
      categoryMapped,
    });
  }
  return products;
}

function getTotalPages(html: string): number {
  const $ = cheerio.load(html);
  let max = 1;
  const text = $("body").text();
  const showing = text.match(/Mostrando\s+\d+\s+productos\s+de\s+(\d+)/i);
  if (showing) {
    const total = parseInt(showing[1], 10);
    if (total > 0) max = Math.ceil(total / 30);
  }
  $('a[href*="page="]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const m = href.match(/[?&]page=(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return max;
}

async function scrapeCategory(
  target: ScrapeTarget,
  maxPages: number
): Promise<{ products: ScrapedProduct[]; notFound: boolean }> {
  const all: ScrapedProduct[] = [];
  const seen = new Set<string>();
  let totalPages = 1;
  let notFound = false;

  for (let page = 1; page <= maxPages; page++) {
    const url = categoryPageUrl(target, page);
    console.log(`  Fetching ${url}`);
    const html = await fetchCategoryHtml(url);
    if (html === null) {
      console.log(`  Omitido: categoría no encontrada (404) en ${url}`);
      notFound = true;
      break;
    }
    if (page === 1) {
      totalPages = Math.min(getTotalPages(html), maxPages);
      console.log(`  Páginas a recorrer: ${totalPages}`);
    }
    const batch = parseProductsFromHtml(
      html,
      target.slug,
      target.categoryMapped
    );
    for (const p of batch) {
      if (seen.has(p.url)) continue;
      seen.add(p.url);
      all.push(p);
    }
    console.log(`  Página ${page}: ${batch.length} (${all.length} acumulados)`);
    if (page >= totalPages || batch.length === 0) break;
    await delay(DELAY_MS);
  }
  return { products: all, notFound };
}

function loadScrapeTargets(outputDir: string): ScrapeTarget[] {
  const mapping = loadMerlinoMapping();
  const categoriesPath = path.join(outputDir, "merlino-categories.json");
  if (!fs.existsSync(categoriesPath)) {
    throw new Error(
      `Falta ${categoriesPath}. Corré primero: npm run scrape:merlino:categories`
    );
  }
  const categories = JSON.parse(
    fs.readFileSync(categoriesPath, "utf-8")
  ) as MerlinoCategory[];

  return categories
    .filter((c) => {
      const mapped = mapping[c.slug]?.trim();
      return mapped && !c.hasChildren;
    })
    .map((c) => ({
      slug: c.slug,
      name: c.name,
      url: c.url,
      categoryMapped: mapping[c.slug].trim(),
    }));
}

function toMaterialsFormat(products: ScrapedProduct[]) {
  const now = new Date().toISOString();
  return products.map((p) => ({
    name: p.name,
    description: p.categoryMerlino,
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

async function fetchCategoryTree(): Promise<VtexCategoryNode[]> {
  const res = await fetch(MERLINO_CATEGORY_TREE_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${MERLINO_CATEGORY_TREE_URL}`);
  }
  return res.json() as Promise<VtexCategoryNode[]>;
}

function flattenCategoryTree(nodes: VtexCategoryNode[]): MerlinoCategory[] {
  const out: MerlinoCategory[] = [];

  function walk(list: VtexCategoryNode[], depth: number) {
    for (const node of list) {
      const slug = slugFromUrl(node.url);
      if (!slug) continue;
      const hasChildren = !!(node.children && node.children.length > 0);
      out.push({
        id: String(node.id),
        slug,
        name: node.name,
        parentSlug: parentSlugFromSlug(slug),
        depth,
        hasChildren,
        url: node.url ?? `${MERLINO_BASE}/${slug}`,
        mappedTo: CATEGORY_MAP[slug],
      });
      if (node.children?.length) walk(node.children, depth + 1);
    }
  }

  walk(nodes, 0);
  return out;
}

async function runCategories(outputDir: string): Promise<void> {
  console.log("Fetching Merlino category tree:", MERLINO_CATEGORY_TREE_URL);
  const tree = await fetchCategoryTree();
  const categories = flattenCategoryTree(tree);
  const leaves = categories.filter((c) => !c.hasChildren);

  const categoriesPath = path.join(outputDir, "merlino-categories.json");
  const mappingCsvPath = path.join(outputDir, "merlino-category-mapping.csv");

  fs.writeFileSync(categoriesPath, JSON.stringify(categories, null, 2), "utf-8");

  const csvLines = [
    "slug,name,id,parentSlug,depth,hasChildren,myCategory,url",
    ...categories.map((c) => {
      const myCategory = (c.mappedTo ?? "").replace(/"/g, '""');
      const name = c.name.replace(/"/g, '""');
      return `"${c.slug}","${name}","${c.id}","${c.parentSlug}",${c.depth},${c.hasChildren},"${myCategory}","${c.url}"`;
    }),
  ];
  fs.writeFileSync(mappingCsvPath, csvLines.join("\n"), "utf-8");

  console.log(`\nDone. ${categories.length} categorías (${leaves.length} hojas sin hijos).`);
  console.log(`Categories: ${categoriesPath}`);
  console.log(`Mapping (editá myCategory): ${mappingCsvPath}`);
  console.log(
    "\nTip: para scrapear sin duplicar productos, mapeá y usá sobre todo categorías hoja (hasChildren=false)."
  );
  console.log(
    "Mapeo automático: npm run map:merlino:categories (LLM, hojas en lotes)."
  );
  console.log(
    "O copiá el CSV editado a scripts/merlino-category-mapping.json."
  );
}

async function runScrape(
  outputDir: string,
  targets: ScrapeTarget[],
  maxPagesPerCategory: number,
  outputSuffix: string
): Promise<void> {
  const all: ScrapedProduct[] = [];
  const seenUrl = new Set<string>();
  const skipped: string[] = [];

  for (const target of targets) {
    console.log(`\n${target.name} (${target.slug}) -> ${target.categoryMapped}`);
    try {
      const { products: batch, notFound } = await scrapeCategory(
        target,
        maxPagesPerCategory
      );
      if (notFound) skipped.push(target.slug);
      for (const p of batch) {
        if (seenUrl.has(p.url)) continue;
        seenUrl.add(p.url);
        all.push(p);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.log(`  Error en categoría, se continúa: ${message}`);
      skipped.push(target.slug);
    }
    await delay(DELAY_MS);
  }

  const rawPath = path.join(outputDir, `merlino-products-${outputSuffix}.json`);
  const materialsPath = path.join(
    outputDir,
    `merlino-materials-${outputSuffix}.json`
  );
  fs.writeFileSync(rawPath, JSON.stringify(all, null, 2), "utf-8");
  fs.writeFileSync(
    materialsPath,
    JSON.stringify(toMaterialsFormat(all), null, 2),
    "utf-8"
  );
  console.log(`\nDone. ${all.length} productos.`);
  if (skipped.length > 0) {
    console.log(
      `Categorías omitidas (${skipped.length}): ${skipped.slice(0, 8).join(", ")}${skipped.length > 8 ? "..." : ""}`
    );
    console.log(
      "Tip: si hay muchas omitidas, corré npm run scrape:merlino:categories y volvé a intentar."
    );
  }
  console.log(`Raw: ${rawPath}`);
  console.log(`Materials: ${materialsPath}`);
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "categories";

  console.log("Merlino");
  console.log("Mode:", mode);

  const outputDir = path.join(process.cwd(), "scripts", "output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (mode === "categories") {
    await runCategories(outputDir);
    return;
  }

  if (mode === "mapping-check") {
    const map = loadMerlinoMapping();
    const filled = Object.entries(map).filter(([, v]) => v.trim());
    const targets = loadScrapeTargets(outputDir);
    console.log(`Mapping cargado: ${filled.length} filas con myCategory.`);
    console.log(`Listas para scrape (hoja + myCategory): ${targets.length}`);
    filled.slice(0, 10).forEach(([slug, cat]) => {
      console.log(`  ${slug} -> ${cat}`);
    });
    if (filled.length > 10) console.log(`  ... y ${filled.length - 10} más`);
    return;
  }

  if (mode === "test" || mode === "all") {
    const mapping = loadMerlinoMapping();
    const targets =
      mode === "test"
        ? (() => {
            const mapped = mapping[TEST_CATEGORY_SLUG]?.trim();
            if (!mapped) {
              throw new Error(
                `Sin myCategory para ${TEST_CATEGORY_SLUG}. Completalo en merlino-category-mapping.csv`
              );
            }
            return [
              {
                slug: TEST_CATEGORY_SLUG,
                name: "Áridos",
                url: `${MERLINO_BASE}/${TEST_CATEGORY_SLUG}`,
                categoryMapped: mapped,
              },
            ];
          })()
        : loadScrapeTargets(outputDir);

    if (targets.length === 0) {
      console.error(
        "No hay categorías para scrapear. Completá myCategory en merlino-category-mapping.csv (categorías hoja, hasChildren=false)."
      );
      process.exit(1);
    }

    console.log(
      `Using mapping: merlino-category-mapping.json o scripts/output/merlino-category-mapping.csv`
    );
    console.log(`Categorías a scrapear: ${targets.length}`);

    const maxPages = mode === "test" ? 2 : 999;
    const suffix = mode === "test" ? "test" : "all";
    await runScrape(outputDir, targets, maxPages, suffix);
    return;
  }

  console.log(
    "Uso: npx tsx scripts/scrape-merlino.ts [categories|mapping-check|test|all]"
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
