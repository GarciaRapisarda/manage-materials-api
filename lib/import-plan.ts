import { enrichFromMappedContext } from "@/lib/import-categorization";
import type { ParsedMaterial } from "@/lib/chunk-parser";
import type { ChunkPreviewItem } from "@/lib/chunk-matcher";

export interface ImportPlan {
  total: number;
  create: number;
  update: number;
  skip: number;
  createsLocal: number;
  createsNeedLlm: number;
  createsNoContext: number;
  llmApiCalls: number;
  llmOpenAiBatches: number;
  unmatchedContexts: string[];
}

const LLM_ITEMS_PER_API_CALL = 150;
const LLM_ITEMS_PER_OPENAI_BATCH = 15;

export function analyzeImportPreview(
  items: ChunkPreviewItem[],
  resolveCategoryId: (categoryName: string) => string
): ImportPlan {
  let create = 0;
  let update = 0;
  let skip = 0;
  let createsLocal = 0;
  let createsNeedLlm = 0;
  let createsNoContext = 0;
  const unmatched = new Set<string>();

  for (const item of items) {
    if (item.action === "create") create++;
    else if (item.action === "update") update++;
    else skip++;

    if (item.action !== "create") continue;

    const ctx = item.parsed.sectionContext?.trim() ?? "";
    if (!ctx) {
      createsNoContext++;
      createsNeedLlm++;
      continue;
    }

    const enriched = enrichFromMappedContext(
      item.parsed.name,
      item.parsed.sectionContext,
      item.parsed.unit,
      resolveCategoryId
    );

    if (enriched) {
      createsLocal++;
    } else {
      createsNeedLlm++;
      unmatched.add(ctx);
    }
  }

  const llmApiCalls = Math.ceil(createsNeedLlm / LLM_ITEMS_PER_API_CALL);
  const llmOpenAiBatches = Math.ceil(createsNeedLlm / LLM_ITEMS_PER_OPENAI_BATCH);

  return {
    total: items.length,
    create,
    update,
    skip,
    createsLocal,
    createsNeedLlm,
    createsNoContext,
    llmApiCalls,
    llmOpenAiBatches,
    unmatchedContexts: [...unmatched].slice(0, 8),
  };
}

export function estimateLlmMinutes(plan: ImportPlan): string {
  if (plan.createsNeedLlm === 0) return "0";
  const min = Math.max(1, Math.ceil(plan.llmOpenAiBatches * 2.5 / 60));
  if (min < 2) return "< 2";
  return `~${min}`;
}

export const IMPORT_PREVIEW_ROW_CAP = 200;
export const LARGE_IMPORT_THRESHOLD = 400;
