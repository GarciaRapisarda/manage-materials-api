import * as fs from "fs";
import * as path from "path";
import * as cheerio from "cheerio";
import {
  ROPELATO_BASE,
  CATEGORY_MAP,
  DELAY_MS,
} from "./ropelato-category-map";
import { loadRopelatoMapping } from "./load-ropelato-mapping";

interface ScrapedProduct {
  name: string;
  price: number;
  priceList: number | null;
  url: string;
  productId: string;
  brand: string | null;
  categoryRopelato: string;
  categoryMapped: string;
}

interface ScrapeTarget {
  slug: string;
  name: string;
  url: string;
  categoryMapped: string;
}

const TEST_CATEGORY_SLUG = "261-hierros-lisos";

export interface RopelatoCategory {
  id: string;
  slug: string;
  name: string;
  parentSlug: string;
  depth: number;
  hasChildren: boolean;
  url: string;
  mappedTo?: string;
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

function slugFromHref(href: string): string {
  if (!href) return "";
  try {
    const u = new URL(href, ROPELATO_BASE);
    const m = u.pathname.match(/^\/(\d+-[^/]+)\/?$/);
    return m ? m[1] : "";
  } catch {
    return "";
  }
}

function idFromSlug(slug: string): string {
  const m = slug.match(/^(\d+)-/);
  return m ? m[1] : slug;
}

function categoryPageUrl(slug: string, page: number): string {
  const base = `${ROPELATO_BASE}/${slug}`;
  return page <= 1 ? base : `${base}?page=${page}`;
}

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "es-AR,es;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.text();
}

function parseProductsFromHtml(
  html: string,
  categorySlug: string,
  categoryMapped: string
): ScrapedProduct[] {
  const $ = cheerio.load(html);
  const products: ScrapedProduct[] = [];

  $(".js-product-miniature").each((_, el) => {
    const $el = $(el);
    const productId = String($el.attr("data-id-product") ?? "").trim();
    const $link = $el.find("a[href*='.html']").first();
    let url = ($link.attr("href") ?? "").trim();
    if (url && !url.startsWith("http")) {
      url = new URL(url, ROPELATO_BASE).href;
    }
    const name = $el
      .find(".product-title a, h3 a, .product-name a")
      .first()
      .text()
      .trim();
    const priceRaw = $el.find(".price, .current-price").first().text().trim();
    const listRaw = $el.find(".regular-price").first().text().trim();
    if (!name || !url || !productId) return;

    const price = parsePrice(priceRaw);
    if (price <= 0) return;

    let priceList: number | null = null;
    if (listRaw) {
      const list = parsePrice(listRaw);
      if (list > price) priceList = list;
    }

    const brand =
      $el.find(".product-brand, .manufacturer-name").first().text().trim() ||
      null;

    products.push({
      name,
      price,
      priceList,
      url: url.split("?")[0],
      productId,
      brand,
      categoryRopelato: categorySlug,
      categoryMapped,
    });
  });

  return products;
}

function getTotalPages(html: string): number {
  const $ = cheerio.load(html);
  let max = 1;
  const countMatch = $("body")
    .text()
    .match(/(\d+)\s+productos/i);
  if (countMatch) {
    const total = parseInt(countMatch[1], 10);
    const perPage = $(".js-product-miniature").length || 20;
    if (total > 0 && perPage > 0) {
      max = Math.max(max, Math.ceil(total / perPage));
    }
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
): Promise<ScrapedProduct[]> {
  const all: ScrapedProduct[] = [];
  const seen = new Set<string>();
  let totalPages = 1;

  for (let page = 1; page <= maxPages; page++) {
    const url = categoryPageUrl(target.slug, page);
    console.log(`  Fetching ${url}`);
    const html = await fetchHtml(url);
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
      const key = p.productId || p.url;
      if (seen.has(key)) continue;
      seen.add(key);
      all.push(p);
    }
    console.log(`  Página ${page}: ${batch.length} (${all.length} acumulados)`);
    if (page >= totalPages || batch.length === 0) break;
    await delay(DELAY_MS);
  }
  return all;
}

function parseCategoriesFromHomepage(html: string): RopelatoCategory[] {
  const $ = cheerio.load(html);
  const flat: {
    slug: string;
    name: string;
    depth: number;
    parentSlug: string;
  }[] = [];
  const parentStack: string[] = [];

  $(
    "li.sj-categmenu-custom-txtcateg, li.sj-categmenu-custom-txtsubcateg, li.sj-subchild-menu-item"
  ).each((_, el) => {
    const $li = $(el);
    const $a = $li.children("a").first();
    const slug = slugFromHref($a.attr("href") ?? "");
    if (!slug) return;

    const name = $a.text().trim().replace(/\s*\|\s*$/, "");
    let depth = 0;
    if ($li.hasClass("sj-categmenu-custom-txtsubcateg")) depth = 1;
    else if ($li.hasClass("sj-subchild-menu-item")) depth = 2;

    parentStack.length = depth;
    const parentSlug = depth > 0 ? parentStack[depth - 1] ?? "" : "";
    parentStack[depth] = slug;

    flat.push({ slug, name, depth, parentSlug });
  });

  const childOf = new Set(flat.map((c) => c.parentSlug).filter(Boolean));
  const seen = new Set<string>();
  const out: RopelatoCategory[] = [];

  for (const c of flat) {
    if (seen.has(c.slug)) continue;
    seen.add(c.slug);
    out.push({
      id: idFromSlug(c.slug),
      slug: c.slug,
      name: c.name,
      parentSlug: c.parentSlug,
      depth: c.depth,
      hasChildren: childOf.has(c.slug),
      url: `${ROPELATO_BASE}/${c.slug}`,
      mappedTo: CATEGORY_MAP[c.slug],
    });
  }

  return out;
}

async function fetchCategoriesFromHomepage(): Promise<RopelatoCategory[]> {
  const html = await fetchHtml(`${ROPELATO_BASE}/`);
  return parseCategoriesFromHomepage(html);
}

function loadScrapeTargets(outputDir: string): ScrapeTarget[] {
  const mapping = loadRopelatoMapping();
  const categoriesPath = path.join(outputDir, "ropelato-categories.json");
  if (!fs.existsSync(categoriesPath)) {
    throw new Error(
      `Falta ${categoriesPath}. Corré primero: npm run scrape:ropelato:categories`
    );
  }
  const categories = JSON.parse(
    fs.readFileSync(categoriesPath, "utf-8")
  ) as RopelatoCategory[];

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
    description: p.categoryRopelato,
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

async function runCategories(outputDir: string): Promise<void> {
  console.log("Fetching Ropelato category menu from homepage");
  const categories = await fetchCategoriesFromHomepage();
  const leaves = categories.filter((c) => !c.hasChildren);

  const categoriesPath = path.join(outputDir, "ropelato-categories.json");
  const mappingCsvPath = path.join(outputDir, "ropelato-category-mapping.csv");

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

  console.log(
    `\nDone. ${categories.length} categorías (${leaves.length} hojas sin hijos).`
  );
  console.log(`Categories: ${categoriesPath}`);
  console.log(`Mapping (editá myCategory): ${mappingCsvPath}`);
  console.log(
    "\nTip: para scrapear sin duplicar productos, mapeá y usá sobre todo categorías hoja (hasChildren=false)."
  );
  console.log(
    "Mapeo automático: npm run map:ropelato:categories (LLM, ~199 hojas en lotes)."
  );
  console.log(
    "O copiá el CSV editado a scripts/ropelato-category-mapping.json."
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

  for (const target of targets) {
    console.log(`\n${target.name} (${target.slug}) -> ${target.categoryMapped}`);
    const batch = await scrapeCategory(target, maxPagesPerCategory);
    for (const p of batch) {
      const key = p.url || p.productId;
      if (seenUrl.has(key)) continue;
      seenUrl.add(key);
      all.push(p);
    }
    await delay(DELAY_MS);
  }

  const rawPath = path.join(outputDir, `ropelato-products-${outputSuffix}.json`);
  const materialsPath = path.join(
    outputDir,
    `ropelato-materials-${outputSuffix}.json`
  );
  fs.writeFileSync(rawPath, JSON.stringify(all, null, 2), "utf-8");
  fs.writeFileSync(
    materialsPath,
    JSON.stringify(toMaterialsFormat(all), null, 2),
    "utf-8"
  );
  console.log(`\nDone. ${all.length} productos.`);
  console.log(`Raw: ${rawPath}`);
  console.log(`Materials: ${materialsPath}`);
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "categories";

  console.log("Ropelato");
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
    const map = loadRopelatoMapping();
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
    const mapping = loadRopelatoMapping();
    const targets =
      mode === "test"
        ? (() => {
            const mapped = mapping[TEST_CATEGORY_SLUG]?.trim();
            if (!mapped) {
              throw new Error(
                `Sin myCategory para ${TEST_CATEGORY_SLUG}. Completalo en ropelato-category-mapping.csv`
              );
            }
            return [
              {
                slug: TEST_CATEGORY_SLUG,
                name: "Hierros lisos",
                url: categoryPageUrl(TEST_CATEGORY_SLUG, 1),
                categoryMapped: mapped,
              },
            ];
          })()
        : loadScrapeTargets(outputDir);

    if (targets.length === 0) {
      console.error(
        "No hay categorías para scrapear. Completá myCategory en ropelato-category-mapping.csv (categorías hoja, hasChildren=false)."
      );
      process.exit(1);
    }

    console.log(
      `Using mapping: ropelato-category-mapping.json o scripts/output/ropelato-category-mapping.csv`
    );
    console.log(`Categorías a scrapear: ${targets.length}`);

    const maxPages = mode === "test" ? 2 : 999;
    const suffix = mode === "test" ? "test" : "all";
    await runScrape(outputDir, targets, maxPages, suffix);
    return;
  }

  console.log(
    "Uso: npx tsx scripts/scrape-ropelato.ts [categories|mapping-check|test|all]"
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
