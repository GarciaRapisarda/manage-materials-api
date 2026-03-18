import * as fs from "fs";
import * as path from "path";
import * as cheerio from "cheerio";
import {
  TODOPROYECTABLE_BASE,
  DELAY_MS,
} from "./todoproyectable-category-map";
import { loadTodoProyectableMapping } from "./load-todoproyectable-mapping";

const CATEGORY_SLUGS = new Set([
  "materiales-proyectables", "cementicios", "yesos", "adherentes", "mallas",
  "pegamento-pisos", "para-ceramicos", "para-porcelanatos", "para-piscinas",
  "losa-radiante", "pegamentos-para-ladrillos", "adhesivos", "impermeables",
  "accesorios-y-repuestos", "alquiler-de-maquinas", "reglas",
  "mangueras-de-proyeccion", "camisas-y-rotores", "2-en-1", "3-en-1",
  "flexibles", "para-ladrillos", "porcellanatto",
]);

function extractBrandFromClasses(classAttr: string): string | null {
  const match = classAttr.match(/product_cat-([a-z0-9-]+)/g);
  if (!match) return null;
  const slugs = match.map((m) => m.replace("product_cat-", ""));
  const candidate = slugs.find((s) => !CATEGORY_SLUGS.has(s));
  if (!candidate) return null;
  const part = candidate.split("-")[0];
  return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
}

interface ScrapedProduct {
  name: string;
  price: number;
  priceRaw: string;
  url: string;
  productId: string;
  categorySlug: string;
  categoryMapped: string;
  brand: string | null;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parsePrice(raw: string): number {
  const desdeMatch = raw.match(/desde\s*\$?\s*([\d.]+),(\d{2})/i);
  if (desdeMatch) {
    const n = parseFloat(
      desdeMatch[1].replace(/\./g, "") + "." + desdeMatch[2]
    );
    return isNaN(n) ? 0 : n;
  }
  const cleaned = raw.replace(/\s/g, "").replace(/[$\u00a0+IVA]/gi, "");
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
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

function parseProductsFromHtml(
  html: string,
  contextCategorySlug: string,
  categoryMap: Record<string, string>
): ScrapedProduct[] {
  const $ = cheerio.load(html);
  const products: ScrapedProduct[] = [];
  const categoryMapped =
    categoryMap[contextCategorySlug] ?? categoryMap["accesorios-y-repuestos"] ?? "Herramientas";

  $("ul.products li.product").each((_, el) => {
    const $el = $(el);
    const link = $el.find("a.woocommerce-LoopProduct-link").attr("href")
      ?? $el.find("a[href*='/producto/']").first().attr("href");
    const name = $el.find(".woocommerce-loop-product__title").text().trim()
      || $el.find("h2").text().trim()
      || $el.find("a[href*='/producto/']").first().text().trim();
    const priceEl = $el.find(".price .amount").first()
      .length ? $el.find(".price .amount").first() : $el.find(".price").first();
    let priceRaw = priceEl.text().trim();
    if (!priceRaw && $el.find(".price").length) {
      priceRaw = $el.find(".price").text().trim();
    }
    const productId = $el.find("[data-product_id]").attr("data-product_id")
      ?? link?.replace(/.*\/producto\/([^/]+)\/?.*/, "$1")
      ?? "";

    if (!link || !name) return;

    const price = parsePrice(priceRaw);
    const outOfStock =
      $el.hasClass("outofstock") ||
      /sin\s*existencias|sin\s*stock|no\s*disponible/i.test($el.text());
    if (price <= 0 || outOfStock) return;

    const classAttr =
      $el.attr("class") ?? $el.find("[class*='product_cat-']").first().attr("class") ?? "";
    const brand = extractBrandFromClasses(classAttr);

    products.push({
      name,
      price,
      priceRaw,
      url: link.startsWith("http") ? link : `${TODOPROYECTABLE_BASE}${link}`,
      productId,
      categorySlug: contextCategorySlug,
      categoryMapped,
      brand,
    });
  });

  if (products.length === 0) {
    $("a[href*='/producto/']").each((_, el) => {
      const $a = $(el);
      const link = $a.attr("href");
      const name = $a.text().trim();
      if (!link || !name || link.includes("categoria")) return;
      const $row = $a.closest("li").length ? $a.closest("li") : $a.closest(".product");
      const priceEl = $row.find(".price, .amount").first();
      const priceRaw = priceEl.text().trim() || $row.find(".price").text().trim();
      const price = parsePrice(priceRaw);
      const outOfStock =
        $row.hasClass("outofstock") ||
        /sin\s*existencias|sin\s*stock|no\s*disponible/i.test($row.text());
      if (price <= 0 || outOfStock) return;
      const classAttr =
        $row.attr("class") ?? $row.find("[class*='product_cat-']").first().attr("class") ?? "";
      const brand = extractBrandFromClasses(classAttr);
      const fullUrl = link.startsWith("http") ? link : `${TODOPROYECTABLE_BASE}${link}`;
      products.push({
        name,
        price,
        priceRaw,
        url: fullUrl,
        productId: link.replace(/.*\/producto\/([^/]+)\/?.*/, "$1"),
        categorySlug: contextCategorySlug,
        categoryMapped,
        brand,
      });
    });
  }

  return products;
}

function getTotalPages($: cheerio.CheerioAPI, basePath: string): number {
  const links = $("nav.woocommerce-pagination a.page-numbers, .pagination a")
    .filter((_, a) => {
      const href = $(a).attr("href") || "";
      return href.includes("/page/") && !$(a).hasClass("next");
    })
    .toArray();
  let max = 1;
  for (const a of links) {
    const href = $(a).attr("href") || "";
    const m = href.match(/\/page\/(\d+)/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max;
}

async function scrapeByCategory(
  categorySlug: string,
  categoryName: string,
  categoryMap: Record<string, string>
): Promise<ScrapedProduct[]> {
  const all: ScrapedProduct[] = [];
  const baseUrl = `${TODOPROYECTABLE_BASE}/categoria-producto/${categorySlug}`;
  let page = 1;
  let totalPages = 1;

  while (true) {
    const url = page === 1 ? `${baseUrl}/` : `${baseUrl}/page/${page}/`;
    console.log(`  ${url}`);

    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    if (page === 1) {
      totalPages = getTotalPages($, baseUrl);
    }

    const batch = parseProductsFromHtml(html, categorySlug, categoryMap);
    all.push(...batch);

    if (page >= totalPages || batch.length === 0) break;
    page++;
    await delay(DELAY_MS);
  }

  return all;
}

interface TPCategory {
  slug: string;
  name: string;
  url: string;
  mappedTo?: string;
}

function extractCategoriesFromHtml(html: string): TPCategory[] {
  const $ = cheerio.load(html);
  const seen = new Set<string>();
  const list: TPCategory[] = [];

  $('a[href*="categoria-producto/"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const match = href.match(/categoria-producto\/([^/]+(?:\/[^/]+)?)\/?/);
    if (!match) return;
    const slug = match[1].replace(/\/$/, "");
    if (seen.has(slug)) return;
    seen.add(slug);
    const name = $(el).text().trim();
    if (!name || name.length > 120) return;
    list.push({
      slug,
      name,
      url: href.startsWith("http") ? href : `${TODOPROYECTABLE_BASE}${href}`,
    });
  });

  return list;
}

async function fetchCategories(): Promise<TPCategory[]> {
  const url = `${TODOPROYECTABLE_BASE}/tienda/`;
  console.log("Fetching categories from:", url);
  const html = await fetchHtml(url);
  const categories = extractCategoriesFromHtml(html);
  const defaultMap = await import("./todoproyectable-category-map").then(
    (m) => m.CATEGORY_MAP
  );
  return categories.map((c) => ({
    ...c,
    mappedTo: defaultMap[c.slug],
  }));
}

async function scrapeAllCategories(
  categoryMap: Record<string, string>
): Promise<ScrapedProduct[]> {
  const categories = await fetchCategories();
  const seen = new Set<string>();
  const all: ScrapedProduct[] = [];

  for (const cat of categories) {
    console.log(`\n${cat.name} (${cat.slug})`);
    const products = await scrapeByCategory(
      cat.slug,
      cat.name,
      categoryMap
    );
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

function toMaterialsFormat(products: ScrapedProduct[]) {
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
  const mode = process.argv[2] || "all";

  console.log("Scraping Todo Proyectable...");
  console.log("Mode:", mode);

  const outputDir = path.join(process.cwd(), "scripts", "output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (mode === "categories") {
    const categories = await fetchCategories();
    const categoriesPath = path.join(
      outputDir,
      "todoproyectable-categories.json"
    );
    const mappingCsvPath = path.join(
      outputDir,
      "todoproyectable-category-mapping.csv"
    );
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

  const categoryMap = loadTodoProyectableMapping();
  console.log("Using mapping: todoproyectable-category-mapping.json or .csv");

  let products: ScrapedProduct[] = [];

  if (mode === "test") {
    const slug = "materiales-proyectables/cementicios";
    const url = `${TODOPROYECTABLE_BASE}/categoria-producto/${slug}/`;
    console.log("Test:", url);
    const html = await fetchHtml(url);
    products = parseProductsFromHtml(html, slug, categoryMap);
    console.log(`Parsed ${products.length} products`);
  } else {
    products = await scrapeAllCategories(categoryMap);
  }

  const rawPath = path.join(outputDir, "todoproyectable-products-raw.json");
  const materialsPath = path.join(outputDir, "todoproyectable-materials.json");

  fs.writeFileSync(
    rawPath,
    JSON.stringify(products, null, 2),
    "utf-8"
  );
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
