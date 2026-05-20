import {
  categorizeMaterials,
  type CategorizeItem,
  type CategorizeResult,
} from "@/services/categorize";

const API_CHUNK_SIZE = 150;

export async function categorizeMaterialsBatched(
  items: CategorizeItem[],
  onProgress?: (done: number, total: number) => void
): Promise<CategorizeResult[]> {
  if (items.length === 0) return [];

  const results: CategorizeResult[] = [];
  for (let i = 0; i < items.length; i += API_CHUNK_SIZE) {
    const chunk = items.slice(i, i + API_CHUNK_SIZE);
    const part = await categorizeMaterials(chunk);
    results.push(...part);
    onProgress?.(Math.min(i + chunk.length, items.length), items.length);
  }
  return results;
}
