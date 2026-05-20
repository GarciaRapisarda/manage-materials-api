import * as fs from "fs";
import * as path from "path";
import * as cheerio from "cheerio";
import { chromium, type Page } from "playwright";
import {
  SODIMAC_BASE,
  DELAY_MS,
  TEST_CATEGORY,
  CATEGORY_MAP,
} from "./sodimac-category-map";

interface ScrapedProduct {
  name: string;
  price: number;
  priceList: number | null;
  priceRaw: string;
  url: string;
  productId: string;
  categorySodimac: string;
  categoryMapped: string;
}

interface SodimacCategory {
  id: string;
  slug: string;
  name: string;
  url: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parsePrice(raw: string): number {
  const cleaned = raw.replace(/\s/g, "").replace(/[$\u00a0C/U]/gi, "");
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(normalized);
  return isNaN(num) ? 0 : num;
}

function categoryUrl(catId: string, slug: string, page = 1): string {
  const base = `${SODIMAC_BASE}/category/${catId}/${slug}/`;
  return page <= 1 ? base : `${base}?currentpage=${page}`;
}

function extractProductId(url: string): string {
  const m = url.match(/\/product\/([^/]+)\//);
  return m ? m[1] : "";
}

function normalizeProductUrl(href: string): string | null {
  if (!href) return null;
  let url = href.trim();
  if (url.startsWith("/")) url = `https://www.sodimac.com.ar${url}`;
  url = url.split("?")[0];
  const m = url.match(
    /^(https:\/\/www\.sodimac\.com\.ar\/sodimac-ar\/product\/[^/]+\/[a-z0-9-]{10,})/i
  );
  return m ? `${m[1]}/` : null;
}

function nameFromSlug(url: string): string {
  const m = url.match(/\/product\/[^/]+\/([a-z0-9-]+)\/?$/i);
  if (!m) return "";
  return m[1]
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function extractPricesFromText(text: string): {
  price: number;
  priceList: number | null;
  priceRaw: string;
} {
  const matches = [...text.matchAll(/\$\s*([\d.]+)/g)];
  const values = matches
    .map((m) => parsePrice(`$${m[1]}`))
    .filter((n) => n > 0);
  const price = values[0] ?? 0;
  const priceList =
    values.length > 1 && values[1] !== price ? values[1] : null;
  const priceRaw = matches
    .slice(0, 2)
    .map((m) => `$${m[1]}`)
    .join(" / ");
  return { price, priceList, priceRaw };
}

function parseProductsFromHtml(
  html: string,
  categorySlug: string
): ScrapedProduct[] {
  const $ = cheerio.load(html);
  const categoryMapped = CATEGORY_MAP[categorySlug] ?? "Otros";
  const products: ScrapedProduct[] = [];
  const seen = new Set<string>();

  $('a[href*="/product/"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const url = normalizeProductUrl(href);
    if (!url || seen.has(url)) return;

    const productId = extractProductId(url);
    if (!productId) return;

    const $link = $(el);
    let card = $link.closest("article, li, [class*='pod'], [class*='product']");
    if (card.length === 0) card = $link.parent().parent();

    let name = "";
    card.find("h2, h3, h4").each((__, h) => {
      const t = $(h).text().trim().replace(/\s+/g, " ");
      if (t.length >= 15 && t.length <= 200) {
        name = t;
        return false;
      }
    });

    if (!name || name.length < 15) {
      name = nameFromSlug(url);
    }
    if (!name || name.length < 10) return;

    const { price, priceList, priceRaw } = extractPricesFromText(
      card.text().slice(0, 800)
    );
    if (price <= 0) return;

    seen.add(url);
    products.push({
      name,
      price,
      priceList,
      priceRaw,
      url,
      productId,
      categorySodimac: categorySlug,
      categoryMapped,
    });
  });

  return products;
}

function getTotalPages(html: string): number {
  const $ = cheerio.load(html);
  let max = 1;
  const text = $("body").text();
  const showing = text.match(/Mostrando\s+\d+\s+productos\s+de\s+(\d+)/i);
  if (showing) {
    const total = parseInt(showing[1], 10);
    const perPage = 28;
    if (total > 0) max = Math.ceil(total / perPage);
  }
  $('a[href*="currentpage="]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const m = href.match(/currentpage=(\d+)/i);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  });
  return max;
}

async function waitForListing(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded");
  try {
    await page.waitForSelector('a[href*="/product/"], h1', { timeout: 25000 });
  } catch {
    await page.waitForTimeout(4000);
  }
  await page.waitForTimeout(1500);
}

async function isBlocked(page: Page): Promise<boolean> {
  const title = (await page.title()).toLowerCase();
  if (title.includes("attention required") || title.includes("just a moment")) {
    return true;
  }
  const body = (await page.locator("body").innerText().catch(() => "")).slice(0, 2000);
  return (
    body.includes("Why have I been blocked") ||
    body.includes("You are unable to access")
  );
}

async function fetchPageHtml(page: Page, url: string, referer?: string): Promise<string> {
  console.log(`  Fetching ${url}`);
  await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
    referer,
  });
  await waitForListing(page);
  if (await isBlocked(page)) {
    throw new Error(
      "Sodimac bloqueó el acceso (Cloudflare). Probá: SODIMAC_HEADED=1 npm run scrape:sodimac:test"
    );
  }
  return page.content();
}

async function createBrowser() {
  const headed = process.env.SODIMAC_HEADED === "1";
  return chromium.launch({
    headless: !headed,
    args: ["--disable-blink-features=AutomationControlled"],
  });
}

async function createPage(browser: Awaited<ReturnType<typeof createBrowser>>) {
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    locale: "es-AR",
    viewport: { width: 1366, height: 900 },
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  return { context, page };
}

async function scrapeCategory(
  page: Page,
  cat: SodimacCategory,
  maxPages: number
): Promise<ScrapedProduct[]> {
  const all: ScrapedProduct[] = [];
  const seen = new Set<string>();
  let totalPages = 1;
  let lastUrl = "";

  for (let p = 1; p <= maxPages; p++) {
    const url = categoryUrl(cat.id, cat.slug, p);
    try {
      const html = await fetchPageHtml(page, url, lastUrl || undefined);
      lastUrl = url;
      if (p === 1) {
        totalPages = Math.min(getTotalPages(html), maxPages);
        console.log(`  Total páginas (cap ${maxPages}): ${totalPages}`);
      }
      const batch = parseProductsFromHtml(html, cat.slug);
      for (const item of batch) {
        const key = item.url || item.name;
        if (seen.has(key)) continue;
        seen.add(key);
        all.push(item);
      }
      console.log(`  Página ${p}: ${batch.length} productos (${all.length} acumulados)`);
      if (p >= totalPages) break;
      await delay(DELAY_MS + 1000);
    } catch (err) {
      if (all.length > 0) {
        console.warn(
          `  Aviso: falló página ${p}, se guardan ${all.length} productos ya obtenidos.`,
          err instanceof Error ? err.message : err
        );
        break;
      }
      throw err;
    }
  }
  return all;
}

function extractCategoriesFromHtml(html: string): SodimacCategory[] {
  const $ = cheerio.load(html);
  const list: SodimacCategory[] = [];
  const seen = new Set<string>();

  $(`a[href*="${SODIMAC_BASE}/category/"]`).each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const m = href.match(/\/category\/(cat\d+)\/([^/?]+)/i);
    if (!m) return;
    const id = m[1];
    const slug = m[2];
    const key = `${id}/${slug}`;
    if (seen.has(key)) return;
    const name = $(el).text().trim().split("\n")[0].trim();
    if (!name || name.length > 80) return;
    if (/^\d+$/.test(name)) return;
    seen.add(key);
    const url = `${SODIMAC_BASE}/category/${id}/${slug}/`;
    list.push({ id, slug, name, url });
  });

  return list;
}

function toMaterialsFormat(products: ScrapedProduct[]) {
  const now = new Date().toISOString();
  return products.map((p) => ({
    name: p.name,
    description: p.categorySodimac,
    price: p.price,
    unit: "u",
    brand: null,
    unquoted: false,
    temporary: false,
    sourceCategory: p.categorySodimac,
    sourceUrl: p.url,
    sourceProductId: p.productId,
    scrapedAt: now,
  }));
}

async function runTest(): Promise<void> {
  console.log("Sodimac scrape TEST:", TEST_CATEGORY.name);
  const browser = await createBrowser();
  const { context, page } = await createPage(browser);
  try {
    const products = await scrapeCategory(page, TEST_CATEGORY, 2);
    const outDir = path.join(process.cwd(), "scripts", "output");
    fs.mkdirSync(outDir, { recursive: true });
    const rawPath = path.join(outDir, "sodimac-products-test.json");
    const matPath = path.join(outDir, "sodimac-materials-test.json");
    fs.writeFileSync(rawPath, JSON.stringify(products, null, 2), "utf-8");
    fs.writeFileSync(
      matPath,
      JSON.stringify(toMaterialsFormat(products), null, 2),
      "utf-8"
    );
    console.log(`\nOK: ${products.length} productos`);
    console.log(`  ${rawPath}`);
    console.log(`  ${matPath}`);
    if (products[0]) {
      console.log("\nEjemplo:", JSON.stringify(products[0], null, 2));
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

async function runCategories(): Promise<void> {
  console.log("Sodimac: descubriendo categorías desde", TEST_CATEGORY.url);
  const browser = await createBrowser();
  const { context, page } = await createPage(browser);
  try {
    const html = await fetchPageHtml(page, TEST_CATEGORY.url);
    const categories = extractCategoriesFromHtml(html);
    const outDir = path.join(process.cwd(), "scripts", "output");
    fs.mkdirSync(outDir, { recursive: true });
    const jsonPath = path.join(outDir, "sodimac-categories.json");
    const csvPath = path.join(outDir, "sodimac-category-mapping.csv");
    fs.writeFileSync(jsonPath, JSON.stringify(categories, null, 2), "utf-8");
    const csv = [
      "id,slug,name,url,mappedTo",
      ...categories.map(
        (c) =>
          `${c.id},${c.slug},"${c.name.replace(/"/g, '""')}",${c.url},`
      ),
    ].join("\n");
    fs.writeFileSync(csvPath, csv, "utf-8");
    console.log(`\nOK: ${categories.length} categorías`);
    console.log(`  ${jsonPath}`);
    console.log(`  ${csvPath}`);
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "test";
  if (mode === "categories") {
    await runCategories();
    return;
  }
  if (mode === "test") {
    await runTest();
    return;
  }
  console.log("Uso: npx tsx scripts/scrape-sodimac.ts [test|categories]");
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
