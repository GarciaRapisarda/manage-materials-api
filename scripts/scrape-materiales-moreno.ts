import * as fs from "fs";
import * as path from "path";
import * as cheerio from "cheerio";
import { MORENO_SHOP, DELAY_MS, CATEGORY_MAP } from "./moreno-category-map";
import { loadMorenoMapping } from "./load-moreno-mapping";

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
  const cleaned = raw.replace(/\s/g, "").replace(/[$\u00a0]/g, "");
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

function getTotalPages($: cheerio.CheerioAPI): number {
  let max = 1;
  $("nav.woocommerce-pagination a.page-number[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const m = href.match(/\/page\/(\d+)\/?/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return max;
}

function parseProductsFromHtml(
  html: string,
  categorySlug: string,
  categoryMap: Record<string, string>
): ScrapedProduct[] {
  const $ = cheerio.load(html);
  const categoryMapped =
    categoryMap[categorySlug] ?? CATEGORY_MAP[categorySlug] ?? "Otros";
  const products: ScrapedProduct[] = [];

  $("div.product-small.col.product.type-product").each((_, el) => {
    const $el = $(el);
    const $link = $el.find("a.woocommerce-LoopProduct-link").first();
    const url = $link.attr("href")?.trim() ?? "";
    const name = $link.text().trim();
    const priceRaw = $el.find(".woocommerce-Price-amount.amount").first().text().trim();
    let productId =
      $el.find("a.add_to_cart_button[data-product_id]").attr("data-product_id") ??
      "";
    if (!productId) {
      const cls = $el.attr("class") ?? "";
      const pm = cls.match(/\bpost-(\d+)\b/);
      if (pm) productId = pm[1];
    }
    if (!url || !name) return;
    const price = parsePrice(priceRaw);
    if (price <= 0) return;
    products.push({
      name,
      price,
      priceRaw,
      url,
      productId: String(productId),
      categorySlug,
      categoryMapped,
      brand: null,
    });
  });

  return products;
}

async function fetchCategoriesFromCatalog(): Promise<
  { slug: string; name: string }[]
> {
  const url = `${MORENO_SHOP}/catalogo/`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  const list: { slug: string; name: string }[] = [];
  const seen = new Set<string>();
  $("ul.product-categories li a[href*='/tienda/categorias/']").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const m = href.match(/\/tienda\/categorias\/([^/]+)\/?(?:$|[?#])/);
    if (!m) return;
    const slug = m[1];
    if (seen.has(slug)) return;
    seen.add(slug);
    const name = $(el).text().trim();
    if (!slug) return;
    list.push({ slug, name });
  });
  return list;
}

async function scrapeByCategory(
  categorySlug: string,
  categoryMap: Record<string, string>
): Promise<ScrapedProduct[]> {
  const all: ScrapedProduct[] = [];
  const baseUrl = `${MORENO_SHOP}/categorias/${categorySlug}`;
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
  const categories = await fetchCategoriesFromCatalog();
  const seen = new Set<string>();
  const all: ScrapedProduct[] = [];

  for (const cat of categories) {
    console.log(`\nCategory: ${cat.name} (${cat.slug})`);
    const products = await scrapeByCategory(cat.slug, categoryMap);
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
  const mode = process.argv[2] || "categories";

  console.log("Materiales Moreno");
  console.log("Mode:", mode);

  const outputDir = path.join(process.cwd(), "scripts", "output");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  if (mode === "categories") {
    const categories = await fetchCategoriesFromCatalog();
    const categoriesPath = path.join(outputDir, "moreno-categories.json");
    const mappingCsvPath = path.join(outputDir, "moreno-category-mapping.csv");
    const withMap = categories.map((c) => ({
      slug: c.slug,
      name: c.name,
      mappedTo: CATEGORY_MAP[c.slug] ?? "",
    }));
    fs.writeFileSync(
      categoriesPath,
      JSON.stringify(withMap, null, 2),
      "utf-8"
    );
    const csvLines = [
      "slug,name,myCategory",
      ...withMap.map(
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

  const categoryMap = loadMorenoMapping();
  console.log("Using mapping: moreno-category-mapping.json or .csv");

  let products: ScrapedProduct[] = [];

  if (mode === "test") {
    const slug = "aditivos";
    const url = `${MORENO_SHOP}/categorias/${slug}/`;
    console.log("Test:", url);
    const html = await fetchHtml(url);
    products = parseProductsFromHtml(html, slug, categoryMap);
    console.log(`Parsed ${products.length} products`);
  } else {
    products = await scrapeAllCategories(categoryMap);
  }

  const rawPath = path.join(outputDir, "moreno-products-raw.json");
  const materialsPath = path.join(outputDir, "moreno-materials.json");
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
