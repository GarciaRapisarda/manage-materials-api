import { readFileSync } from "fs";
import { resolve } from "path";
import { config } from "dotenv";
import { API_BASE_URL, CATEGORIES_PATH } from "../config/api";
import { alumetalToParsed, type AlumetalMaterial } from "../lib/alumetal-importer";
import { matchChunkToMaterials } from "../lib/chunk-matcher";
import {
  analyzeImportPreview,
  estimateLlmMinutes,
  LARGE_IMPORT_THRESHOLD,
} from "../lib/import-plan";
import { normalizeCategoryFromApi } from "../services/categories";
import { normalizeMaterialFromApi } from "../services/materials";
import type { Category } from "../types/category";
import type { Material } from "../types/material";

config({ path: resolve(process.cwd(), ".env.local") });

function normalizeCategoryName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function loadJson(path: string): AlumetalMaterial[] {
  const text = readFileSync(path, "utf-8");
  const data = JSON.parse(text) as AlumetalMaterial[] | { data: AlumetalMaterial[] };
  const items = Array.isArray(data)
    ? data
    : "data" in data && Array.isArray(data.data)
      ? data.data
      : [];
  if (items.length === 0) {
    throw new Error("El JSON no contiene materiales");
  }
  return items;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} → ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function main() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error("Uso: npm run analyze:import -- <ruta-al-json>");
    console.error("Requiere la API en NEXT_PUBLIC_API_BASE_URL (ver .env.local).");
    process.exit(1);
  }

  const filePath = resolve(process.cwd(), fileArg);
  const items = loadJson(filePath);
  const parsed = alumetalToParsed(items);

  const categoriesPath = CATEGORIES_PATH.startsWith("/")
    ? CATEGORIES_PATH.slice(1)
    : CATEGORIES_PATH;
  const categoriesJson = await fetchJson<{ data?: unknown }>(
    `${API_BASE_URL}/${categoriesPath}`
  );
  const categories: Category[] = Array.isArray(categoriesJson.data)
    ? categoriesJson.data.map((row) => normalizeCategoryFromApi(row))
    : [];

  const materialsJson = await fetchJson<{ data?: unknown }>(
    `${API_BASE_URL}/materials/all`
  );
  const materials: Material[] = Array.isArray(materialsJson.data)
    ? materialsJson.data.map((row) => normalizeMaterialFromApi(row))
    : [];

  function resolveCategoryId(categoryName: string): string {
    if (!categoryName?.trim()) return "";
    const normalized = normalizeCategoryName(categoryName);
    const c = categories.find(
      (cat) =>
        cat.name === categoryName ||
        cat.name.toLowerCase() === categoryName.toLowerCase() ||
        normalizeCategoryName(cat.name) === normalized
    );
    return c?.id ?? "";
  }

  const preview = matchChunkToMaterials(parsed, materials);
  const plan = analyzeImportPreview(preview, resolveCategoryId);

  const contexts = new Map<string, number>();
  for (const row of items) {
    const ctx = row.sourceCategory?.trim() ?? "(sin sourceCategory)";
    contexts.set(ctx, (contexts.get(ctx) ?? 0) + 1);
  }

  console.log(`\nArchivo: ${filePath}`);
  console.log(`Productos en JSON: ${items.length}`);
  console.log(`Materiales en API: ${materials.length}`);
  console.log(`Categorías en API: ${categories.length}\n`);

  console.log("--- Plan de importación ---");
  console.log(`Total filas: ${plan.total}`);
  console.log(`Crear: ${plan.create} · Actualizar: ${plan.update} · Sin cambios: ${plan.skip}`);
  console.log(
    `Categoría sin LLM: ${plan.createsLocal} · con LLM: ${plan.createsNeedLlm}`
  );
  if (plan.createsNeedLlm > 0) {
    console.log(
      `LLM estimado: ${plan.llmApiCalls} requests API · ${plan.llmOpenAiBatches} lotes OpenAI · ${estimateLlmMinutes(plan)} min aprox.`
    );
  }
  if (plan.createsNoContext > 0) {
    console.log(`Sin sourceCategory: ${plan.createsNoContext}`);
  }
  if (plan.unmatchedContexts.length > 0) {
    console.log(
      `Contextos sin match en API (muestra): ${plan.unmatchedContexts.join("; ")}`
    );
  }

  const needsConfirm =
    plan.createsNeedLlm > 0 && plan.total >= LARGE_IMPORT_THRESHOLD;
  if (needsConfirm) {
    console.log(
      `\nEn la app (> ${LARGE_IMPORT_THRESHOLD} filas y LLM > 0) se pedirá confirmar antes de llamar al LLM.`
    );
  } else if (plan.createsNeedLlm === 0 && plan.create > 0) {
    console.log(
      "\nImportación eficiente: todos los altas pueden resolverse por sourceCategory (sin LLM)."
    );
  }

  const topContexts = [...contexts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);
  console.log("\n--- Top sourceCategory en JSON ---");
  for (const [name, count] of topContexts) {
    const ok = name === "(sin sourceCategory)" ? "?" : resolveCategoryId(name) ? "OK" : "sin match";
    console.log(`  ${count.toString().padStart(5)}  [${ok}]  ${name}`);
  }
  console.log("");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
