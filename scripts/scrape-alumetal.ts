import * as fs from "fs";
import * as path from "path";
import * as cheerio from "cheerio";
import { ALUMETAL_BASE, DELAY_MS } from "./alumetal-category-map";
import { loadCategoryMapping } from "./load-category-mapping";

interface ScrapedProduct {
  name: string;
  price: number;
  priceRaw: string;
  url: string;
  productId: string;
  categoryAlumetal: string;
  categoryMapped: string;
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

function extractCategorySlug(classAttr: string): string | null {
  const match = classAttr?.match(/product_cat-([a-z0-9-]+)/);
  return match ? match[1] : null;
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
  contextCategorySlug: string | null,
  categoryMap: Record<string, string>
): ScrapedProduct[] {
  const $ = cheerio.load(html);
  const products: ScrapedProduct[] = [];

  $("ul.products li.product").each((_, el) => {
    const $el = $(el);
    const link = $el.find("a.woocommerce-LoopProduct-link").attr("href");
    const name = $el.find("h2.woocommerce-loop-product__title").text().trim();
    const priceEl = $el.find(".woocommerce-Price-amount").first();
    const priceRaw = priceEl.text().trim();
    const productId =
      $el.find("button[data-product_id]").attr("data-product_id") || "";

    const classAttr = $el.attr("class") || "";
    const categorySlug =
      extractCategorySlug(classAttr) || contextCategorySlug || "sin-categorizar";
    const categoryMapped =
      categoryMap[categorySlug] ?? categoryMap["sin-categorizar"] ?? "Otros";

    if (!link || !name) return;

    products.push({
      name,
      price: parsePrice(priceRaw),
      priceRaw,
      url: link,
      productId,
      categoryAlumetal: categorySlug,
      categoryMapped,
    });
  });

  return products;
}

function getTotalPages($: cheerio.CheerioAPI): number {
  const lastLink = $("nav.woocommerce-pagination a.page-numbers")
    .filter((_, a) => {
      const href = $(a).attr("href") || "";
      const m = href.match(/page\/(\d+)/);
      return !!m && !$(a).hasClass("next");
    })
    .last()
    .attr("href");
  if (!lastLink) return 1;
  const m = lastLink.match(/page\/(\d+)/);
  return m ? parseInt(m[1], 10) : 1;
}

async function scrapeByCategory(
  categorySlug: string,
  categoryName: string,
  categoryMap: Record<string, string>
): Promise<ScrapedProduct[]> {
  const all: ScrapedProduct[] = [];
  const baseUrl = `${ALUMETAL_BASE}/categoria-producto/${categorySlug}`;
  let page = 1;
  let totalPages = 1;

  while (true) {
    const url =
      page === 1 ? `${baseUrl}/` : `${baseUrl}/page/${page}/`;
    console.log(`  Fetching ${url}`);

    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    if (page === 1) {
      totalPages = getTotalPages($);
    }

    const batch = parseProductsFromHtml(html, categorySlug, categoryMap);
    all.push(...batch);

    if (page >= totalPages || batch.length === 0) break;
    page++;
    await delay(DELAY_MS);
  }

  return all;
}

async function scrapeAllCategories(
  categoryMap: Record<string, string>
): Promise<ScrapedProduct[]> {
  const indexUrl = `${ALUMETAL_BASE}/`;
  console.log("Fetching index for categories...");
  const html = await fetchHtml(indexUrl);
  const $ = cheerio.load(html);

  const categories: { slug: string; name: string }[] = [];
  $("#product_cat option[value]").each((_, opt) => {
    const slug = $(opt).attr("value");
    const text = $(opt).text().trim();
    if (slug) {
      categories.push({ slug, name: text });
    }
  });

  const seen = new Set<string>();
  const all: ScrapedProduct[] = [];

  for (const cat of categories) {
    if (cat.slug === "sin-categorizar") continue;

    console.log(`\nCategory: ${cat.name} (${cat.slug})`);
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
    brand: null,
    unquoted: false,
    temporary: false,
    sourceCategory: p.categoryMapped,
    sourceUrl: p.url,
    sourceProductId: p.productId,
    scrapedAt: now,
  }));
}

interface AlumetalCategory {
  slug: string;
  name: string;
  count: number;
  mappedTo?: string;
}

async function fetchCategories(): Promise<AlumetalCategory[]> {
  const url = `${ALUMETAL_BASE}/`;
  console.log("Fetching categories from:", url);
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const defaultMap = await import("./alumetal-category-map").then(
    (m) => m.CATEGORY_MAP
  );
  const categories: AlumetalCategory[] = [];

  $("#product_cat option[value]").each((_, opt) => {
    const slug = $(opt).attr("value");
    const text = $(opt).text().replace(/\u00a0/g, " ").trim();
    if (!slug) return;

    const countMatch = text.match(/\((\d+)\)\s*$/);
    const count = countMatch ? parseInt(countMatch[1], 10) : 0;
    const name = text.replace(/\s*\(\d+\)\s*$/, "").trim();

    categories.push({
      slug,
      name,
      count,
      mappedTo: defaultMap[slug],
    });
  });

  return categories;
}

async function main() {
  const mode = process.argv[2] || "all";

  console.log("Scraping Alumetal...");
  console.log("Mode:", mode);

  const outputDir = path.join(process.cwd(), "scripts", "output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (mode === "categories") {
    const categories = await fetchCategories();
    const categoriesPath = path.join(outputDir, "alumetal-categories.json");
    const mappingCsvPath = path.join(
      outputDir,
      "alumetal-category-mapping.csv"
    );
    fs.writeFileSync(
      categoriesPath,
      JSON.stringify(categories, null, 2),
      "utf-8"
    );
    const csvLines = [
      "slug,name,count,myCategory",
      ...categories.map(
        (c) =>
          `"${c.slug}","${c.name.replace(/"/g, '""')}",${c.count},"${(c.mappedTo ?? "").replace(/"/g, '""')}"`
      ),
    ];
    fs.writeFileSync(mappingCsvPath, csvLines.join("\n"), "utf-8");
    console.log(`\nDone. ${categories.length} categories.`);
    console.log(`Categories: ${categoriesPath}`);
    console.log(`Mapping (edit myCategory): ${mappingCsvPath}`);
    return;
  }

  const categoryMap = loadCategoryMapping();
  console.log("Using mapping from: alumetal-category-mapping.json or .csv");

  let products: ScrapedProduct[] = [];

  if (mode === "test") {
    const url = `${ALUMETAL_BASE}/categoria-producto/accesorios-herramientas/`;
    console.log("Test: fetching single category page:", url);
    const html = await fetchHtml(url);
    products = parseProductsFromHtml(
      html,
      "accesorios-herramientas",
      categoryMap
    );
    console.log(`Parsed ${products.length} products`);
  } else {
    products = await scrapeAllCategories(categoryMap);
  }

  const rawPath = path.join(outputDir, "alumetal-products-raw.json");
  const materialsPath = path.join(outputDir, "alumetal-materials.json");

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
  console.log(`Materials format: ${materialsPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
