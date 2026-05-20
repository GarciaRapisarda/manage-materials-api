import { enrichFromMappedContext } from "@/lib/import-categorization";
import type { ChunkPreviewItem } from "@/lib/chunk-matcher";
import type { CategorizeItem, CategorizeResult } from "@/services/categorize";
import { categorizeMaterialsBatched } from "@/lib/categorize-batched";

export async function enrichPreviewCreates(
  items: ChunkPreviewItem[],
  resolveCategoryId: (categoryName: string) => string,
  fallbackCategoryId: string,
  onProgress?: (message: string) => void
): Promise<{ items: ChunkPreviewItem[]; llmCount: number; mappedCount: number }> {
  const result = items.map((item) => ({ ...item }));
  const needsLlm: number[] = [];
  let mappedCount = 0;

  for (let i = 0; i < result.length; i++) {
    const item = result[i];
    if (item.action !== "create") continue;

    const enriched = enrichFromMappedContext(
      item.parsed.name,
      item.parsed.sectionContext,
      item.parsed.unit,
      resolveCategoryId
    );

    if (enriched) {
      result[i] = { ...item, llmResult: enriched };
      mappedCount++;
    } else {
      needsLlm.push(i);
    }
  }

  if (needsLlm.length === 0) {
    return { items: result, llmCount: 0, mappedCount };
  }

  onProgress?.(
    `LLM: 0/${needsLlm.length} (categoría local: ${mappedCount})`
  );

  const llmItems: CategorizeItem[] = needsLlm.map((i) => ({
    name: result[i].parsed.name,
    sectionContext: result[i].parsed.sectionContext,
  }));

  const llmResults = await categorizeMaterialsBatched(
    llmItems,
    (done, total) => {
      onProgress?.(
        `LLM: ${done}/${total} (categoría local: ${mappedCount})`
      );
    }
  );

  needsLlm.forEach((idx, j) => {
    const item = result[idx];
    const r = llmResults[j];
    if (r) {
      result[idx] = { ...item, llmResult: r };
      return;
    }
    const catId =
      resolveCategoryId(item.parsed.sectionContext ?? "") || fallbackCategoryId;
    result[idx] = {
      ...item,
      llmResult: {
        categoryId: catId,
        unit: item.parsed.unit ?? "u",
      },
    };
  });

  return { items: result, llmCount: needsLlm.length, mappedCount };
}
