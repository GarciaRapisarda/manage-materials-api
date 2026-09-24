import { spawn } from "node:child_process";
import * as path from "path";

type Source = {
  label: string;
  scrapeScript: string;
  mapKey: string;
};

type StepResult = {
  label: string;
  ok: boolean;
  step: string;
};

const SOURCES: Source[] = [
  { label: "Alumetal", scrapeScript: "scrape-alumetal.ts", mapKey: "alumetal" },
  {
    label: "Todo Proyectable",
    scrapeScript: "scrape-todoproyectable.ts",
    mapKey: "todoproyectable",
  },
  { label: "Edify", scrapeScript: "scrape-edify.ts", mapKey: "edify" },
  {
    label: "Materiales Moreno",
    scrapeScript: "scrape-materiales-moreno.ts",
    mapKey: "moreno",
  },
  { label: "Merlino", scrapeScript: "scrape-merlino.ts", mapKey: "merlino" },
  { label: "Ropelato", scrapeScript: "scrape-ropelato.ts", mapKey: "ropelato" },
];

function runScript(scriptName: string, args: string[]): Promise<number> {
  const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const scriptPath = path.join(process.cwd(), "scripts", scriptName);

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [tsxCli, scriptPath, ...args], {
      stdio: "inherit",
      cwd: process.cwd(),
      env: process.env,
    });
    child.on("error", (err) => {
      console.error(err);
      resolve(1);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

async function runSource(
  source: Source,
  refreshCategories: boolean
): Promise<StepResult> {
  if (refreshCategories) {
    console.log(`\n=== ${source.label}: categorías ===`);
    const categoriesCode = await runScript(source.scrapeScript, ["categories"]);
    if (categoriesCode !== 0) {
      return { label: source.label, ok: false, step: "categorías" };
    }

    console.log(`\n=== ${source.label}: mapeo LLM ===`);
    const mapCode = await runScript("map-categories-llm.ts", [source.mapKey]);
    if (mapCode !== 0) {
      return { label: source.label, ok: false, step: "mapeo" };
    }
  }

  console.log(`\n=== ${source.label}: scrape ===`);
  const scrapeCode = await runScript(source.scrapeScript, ["all"]);
  if (scrapeCode !== 0) {
    return { label: source.label, ok: false, step: "scrape" };
  }

  return { label: source.label, ok: true, step: "scrape" };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const refreshCategories = args.includes("--refresh-categories");
  const unknown = args.filter((arg) => arg !== "--refresh-categories");

  if (unknown.length > 0) {
    console.error(
      "Uso: npm run scrape:all [-- --refresh-categories]\n" +
        "Sin flag: scrape completo de cada tienda.\n" +
        "--refresh-categories: descubre categorías y mapea con LLM antes del scrape."
    );
    process.exit(1);
  }

  const results: StepResult[] = [];
  for (const source of SOURCES) {
    results.push(await runSource(source, refreshCategories));
  }

  console.log("\n=== Resumen ===");
  for (const result of results) {
    console.log(
      result.ok ? `${result.label}: ok` : `${result.label}: falló en ${result.step}`
    );
  }

  if (results.some((result) => !result.ok)) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
