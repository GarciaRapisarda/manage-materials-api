import * as fs from "fs";
import * as path from "path";
import { config } from "dotenv";

config({ path: path.join(process.cwd(), ".env.local") });

const BATCH_SIZE = 25;

interface FlatCategory {
  slug: string;
  name: string;
  parentSlug?: string;
  hasChildren?: boolean;
  count?: number;
  mappedTo?: string;
  url?: string;
}

interface MapEntry {
  slug: string;
  label: string;
}

type SourceKey =
  | "ropelato"
  | "merlino"
  | "alumetal"
  | "todoproyectable"
  | "edify"
  | "moreno"
  | "all-pending";

type SourceMode = "tree-leaves" | "flat-all";

interface SourceConfig {
  categoriesFile: string;
  mappingJson: string;
  mappingCsv: string;
  categoryMapTs: string;
  mode: SourceMode;
  csvFormat: "tree" | "alumetal" | "simple";
  scrapeHint: string;
  categoriesCmd: string;
}

const SOURCES: Record<Exclude<SourceKey, "all-pending">, SourceConfig> = {
  ropelato: {
    categoriesFile: "ropelato-categories.json",
    mappingJson: "ropelato-category-mapping.json",
    mappingCsv: "ropelato-category-mapping.csv",
    categoryMapTs: "ropelato-category-map.ts",
    mode: "tree-leaves",
    csvFormat: "tree",
    scrapeHint: "npm run scrape:ropelato",
    categoriesCmd: "npm run scrape:ropelato:categories",
  },
  merlino: {
    categoriesFile: "merlino-categories.json",
    mappingJson: "merlino-category-mapping.json",
    mappingCsv: "merlino-category-mapping.csv",
    categoryMapTs: "merlino-category-map.ts",
    mode: "tree-leaves",
    csvFormat: "tree",
    scrapeHint: "npm run scrape:merlino",
    categoriesCmd: "npm run scrape:merlino:categories",
  },
  alumetal: {
    categoriesFile: "alumetal-categories.json",
    mappingJson: "alumetal-category-mapping.json",
    mappingCsv: "alumetal-category-mapping.csv",
    categoryMapTs: "alumetal-category-map.ts",
    mode: "flat-all",
    csvFormat: "alumetal",
    scrapeHint: "npm run scrape:alumetal",
    categoriesCmd: "npm run scrape:alumetal:categories",
  },
  todoproyectable: {
    categoriesFile: "todoproyectable-categories.json",
    mappingJson: "todoproyectable-category-mapping.json",
    mappingCsv: "todoproyectable-category-mapping.csv",
    categoryMapTs: "todoproyectable-category-map.ts",
    mode: "flat-all",
    csvFormat: "simple",
    scrapeHint: "npm run scrape:todoproyectable",
    categoriesCmd: "npm run scrape:todoproyectable:categories",
  },
  edify: {
    categoriesFile: "edify-categories.json",
    mappingJson: "edify-category-mapping.json",
    mappingCsv: "edify-category-mapping.csv",
    categoryMapTs: "edify-category-map.ts",
    mode: "flat-all",
    csvFormat: "simple",
    scrapeHint: "npm run scrape:edify",
    categoriesCmd: "npm run scrape:edify:categories",
  },
  moreno: {
    categoriesFile: "moreno-categories.json",
    mappingJson: "moreno-category-mapping.json",
    mappingCsv: "moreno-category-mapping.csv",
    categoryMapTs: "moreno-category-map.ts",
    mode: "flat-all",
    csvFormat: "simple",
    scrapeHint: "npm run scrape:moreno",
    categoriesCmd: "npm run scrape:moreno:categories",
  },
};

const PENDING_SOURCES: Array<Exclude<SourceKey, "all-pending">> = [
  "merlino",
  "edify",
  "moreno",
  "todoproyectable",
];

function getValidCategoryNames(): string[] {
  const docPath = path.join(process.cwd(), "docs", "categorias-llm-contexto.md");
  const doc = fs.readFileSync(docPath, "utf-8").replace(/\r\n/g, "\n");
  const names: string[] = [];
  for (const line of doc.split("\n")) {
    const m = line.match(/^###\s+\d+\s*\|\s*(.+)$/);
    if (m) names.push(m[1].trim());
  }
  if (names.length === 0) {
    throw new Error("No se pudieron leer categorías desde docs/categorias-llm-contexto.md");
  }
  return names;
}

function loadDefaultsFromTs(scriptsDir: string, tsFile: string): Record<string, string> {
  const filePath = path.join(scriptsDir, tsFile);
  if (!fs.existsSync(filePath)) return {};
  const text = fs.readFileSync(filePath, "utf-8");
  const map: Record<string, string> = {};
  for (const m of text.matchAll(/"([^"]+)":\s*\n?\s*"([^"]*)"/g)) {
    map[m[1]] = m[2];
  }
  for (const m of text.matchAll(/"([^"]+)":\s*"([^"]*)"/g)) {
    if (!map[m[1]]) map[m[1]] = m[2];
  }
  for (const m of text.matchAll(/^\s+([a-z0-9-]+):\s*"([^"]*)"/gm)) {
    if (!map[m[1]]) map[m[1]] = m[2];
  }
  return map;
}

function buildBreadcrumbTree(
  categories: FlatCategory[],
  slug: string
): string {
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const parts: string[] = [];
  let current = bySlug.get(slug);
  while (current) {
    parts.unshift(current.name);
    current = current.parentSlug
      ? bySlug.get(current.parentSlug)
      : undefined;
  }
  return parts.join(" > ");
}

function buildBreadcrumbFromSlugPath(
  categories: FlatCategory[],
  slug: string
): string {
  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const parts: string[] = [];
  const segments: string[] = [];
  for (const part of slug.split("/")) {
    segments.push(part);
    const key = segments.join("/");
    const cat = bySlug.get(key);
    if (cat) parts.push(cat.name);
  }
  if (parts.length > 0) return parts.join(" > ");
  return bySlug.get(slug)?.name ?? slug;
}

function loadEntries(
  outputDir: string,
  cfg: SourceConfig
): { entries: MapEntry[]; categories: FlatCategory[] } {
  const filePath = path.join(outputDir, cfg.categoriesFile);
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Falta ${filePath}. Corré primero: ${cfg.categoriesCmd}`
    );
  }
  const categories = JSON.parse(
    fs.readFileSync(filePath, "utf-8")
  ) as FlatCategory[];

  if (cfg.mode === "tree-leaves") {
    const entries = categories
      .filter((c) => !c.hasChildren)
      .map((c) => ({
        slug: c.slug,
        label: buildBreadcrumbTree(categories, c.slug),
      }));
    return { entries, categories };
  }

  const entries = categories.map((c) => ({
    slug: c.slug,
    label:
      c.slug.includes("/")
        ? buildBreadcrumbFromSlugPath(categories, c.slug)
        : c.name,
  }));
  return { entries, categories };
}

function loadExistingMapping(
  scriptsDir: string,
  cfg: SourceConfig
): Record<string, string> {
  const defaults = loadDefaultsFromTs(scriptsDir, cfg.categoryMapTs);
  const jsonPath = path.join(scriptsDir, cfg.mappingJson);
  if (fs.existsSync(jsonPath)) {
    const fromJson = JSON.parse(
      fs.readFileSync(jsonPath, "utf-8")
    ) as Record<string, string>;
    return { ...defaults, ...fromJson };
  }
  return { ...defaults };
}

function isValidMapped(
  mapping: Record<string, string>,
  slug: string,
  validSet: Set<string>
): boolean {
  const v = mapping[slug]?.trim();
  if (!v) return false;
  return validSet.has(v);
}

async function mapBatch(
  batch: MapEntry[],
  validNames: string[],
  categoriasDoc: string,
  apiKey: string
): Promise<Record<string, string>> {
  const prompt = `Asigná cada categoría de tienda externa a UNA categoría interna.

LISTA CERRADA (usá el nombre EXACTO, carácter por carácter):
${JSON.stringify(validNames)}

Para cada ítem devolvé slug y myCategory (nombre exacto de la lista).
Si la sección de la tienda es ambigua, elegí la categoría interna más razonable según el breadcrumb (label).

Entrada:
${JSON.stringify(batch, null, 0)}

Formato: [{"slug":"...","myCategory":"..."}, ...] — mismo orden y cantidad que la entrada.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: categoriasDoc },
        { role: "user", content: prompt },
      ],
      temperature: 0,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = data.choices?.[0]?.message?.content?.trim();
  if (!raw) throw new Error("OpenAI no devolvió contenido");

  const cleaned = raw.replace(/```json\n?|\n?```/g, "").trim();
  const parsed = JSON.parse(cleaned) as Array<{
    slug?: string;
    myCategory?: string;
    category?: string;
  }>;

  const validSet = new Set(validNames);
  const out: Record<string, string> = {};
  for (let i = 0; i < batch.length; i++) {
    const row = parsed[i];
    const slug = String(row?.slug ?? batch[i].slug).trim();
    let name = String(row?.myCategory ?? row?.category ?? "").trim();
    if (!validSet.has(name)) {
      const match = validNames.find(
        (v) => v.toLowerCase() === name.toLowerCase()
      );
      if (match) name = match;
      else {
        console.warn(`  ⚠ ${slug}: "${name}" no está en la lista, se omite`);
        continue;
      }
    }
    out[slug] = name;
  }
  return out;
}

function writeMappingCsv(
  csvPath: string,
  categories: FlatCategory[],
  mapping: Record<string, string>,
  format: SourceConfig["csvFormat"]
): void {
  if (format === "tree") {
    const lines = [
      "slug,name,id,parentSlug,depth,hasChildren,myCategory,url",
      ...categories.map((c) => {
        const myCategory = (mapping[c.slug] ?? "").replace(/"/g, '""');
        const name = (c.name ?? "").replace(/"/g, '""');
        const id = String((c as { id?: string }).id ?? "").replace(/"/g, '""');
        const parentSlug = (c.parentSlug ?? "").replace(/"/g, '""');
        const depth = (c as { depth?: number }).depth ?? 0;
        const hasChildren = c.hasChildren ?? false;
        const url = String(c.url ?? "").replace(/"/g, '""');
        return `"${c.slug}","${name}","${id}","${parentSlug}",${depth},${hasChildren},"${myCategory}","${url}"`;
      }),
    ];
    fs.writeFileSync(csvPath, lines.join("\n"), "utf-8");
    return;
  }

  if (format === "alumetal") {
    const lines = [
      "slug,name,count,myCategory",
      ...categories.map((c) => {
        const myCategory = (mapping[c.slug] ?? "").replace(/"/g, '""');
        const name = (c.name ?? "").replace(/"/g, '""');
        const count = c.count ?? 0;
        return `"${c.slug}","${name}",${count},"${myCategory}"`;
      }),
    ];
    fs.writeFileSync(csvPath, lines.join("\n"), "utf-8");
    return;
  }

  const lines = [
    "slug,name,myCategory",
    ...categories.map((c) => {
      const myCategory = (mapping[c.slug] ?? "").replace(/"/g, '""');
      const name = (c.name ?? "").replace(/"/g, '""');
      return `"${c.slug}","${name}","${myCategory}"`;
    }),
  ];
  fs.writeFileSync(csvPath, lines.join("\n"), "utf-8");
}

async function runSource(
  source: Exclude<SourceKey, "all-pending">,
  force: boolean,
  apiKey: string,
  categoriasDoc: string,
  validNames: string[]
): Promise<void> {
  const cfg = SOURCES[source];
  const outputDir = path.join(process.cwd(), "scripts", "output");
  const scriptsDir = path.join(process.cwd(), "scripts");
  const validSet = new Set(validNames);

  const { entries, categories } = loadEntries(outputDir, cfg);
  const existing = loadExistingMapping(scriptsDir, cfg);

  const toMap = entries.filter(
    (e) => force || !isValidMapped(existing, e.slug, validSet)
  );

  console.log(`\n=== ${source} ===`);
  console.log(
    `${entries.length} categorías${cfg.mode === "tree-leaves" ? " (hojas)" : ""}, ${toMap.length} a mapear con LLM`
  );

  if (toMap.length === 0) {
    const filled = entries.filter((e) =>
      isValidMapped(existing, e.slug, validSet)
    ).length;
    console.log(`Nada pendiente (${filled}/${entries.length} con nombre interno válido).`);
    return;
  }

  const mapping: Record<string, string> = { ...existing };

  for (let i = 0; i < toMap.length; i += BATCH_SIZE) {
    const batch = toMap.slice(i, i + BATCH_SIZE);
    console.log(
      `  Lote ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(toMap.length / BATCH_SIZE)} (${batch.length})...`
    );
    const batchResult = await mapBatch(batch, validNames, categoriasDoc, apiKey);
    Object.assign(mapping, batchResult);
  }

  const jsonPath = path.join(scriptsDir, cfg.mappingJson);
  fs.writeFileSync(jsonPath, JSON.stringify(mapping, null, 2), "utf-8");
  console.log(`Mapping JSON: ${jsonPath} (${Object.keys(mapping).length} entradas)`);

  const csvPath = path.join(outputDir, cfg.mappingCsv);
  writeMappingCsv(csvPath, categories, mapping, cfg.csvFormat);
  console.log(`CSV: ${csvPath}`);

  const filled = entries.filter((e) =>
    isValidMapped(mapping, e.slug, validSet)
  ).length;
  console.log(`Listas: ${filled}/${entries.length}. Luego: ${cfg.scrapeHint}`);
}

async function main(): Promise<void> {
  const arg = process.argv[2] ?? "";
  const force = process.argv.includes("--force");

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("OPENAI_API_KEY no configurada en .env.local");
    process.exit(1);
  }

  const categoriasDoc = fs.readFileSync(
    path.join(process.cwd(), "docs", "categorias-llm-contexto.md"),
    "utf-8"
  );
  const validNames = getValidCategoryNames();

  if (arg === "all-pending") {
    console.log("Mapeo LLM — pendientes/dudosos:", PENDING_SOURCES.join(", "));
    for (const source of PENDING_SOURCES) {
      await runSource(source, force, apiKey, categoriasDoc, validNames);
    }
    console.log("\nListo.");
    return;
  }

  if (!(arg in SOURCES)) {
    console.error(
      "Uso: npx tsx scripts/map-categories-llm.ts <origen|all-pending> [--force]\n" +
        "Orígenes: ropelato, merlino, alumetal, todoproyectable, edify, moreno, all-pending"
    );
    process.exit(1);
  }

  await runSource(
    arg as Exclude<SourceKey, "all-pending">,
    force,
    apiKey,
    categoriasDoc,
    validNames
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
