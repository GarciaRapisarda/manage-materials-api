import type { ParsedMaterial } from "./chunk-parser";
import type { Material } from "@/types/material";
import { normalizeForMaterialMatch } from "./material-name-match";

export function normalizeForMatch(name: string): string {
  return normalizeForMaterialMatch(name);
}

export type ChunkPreviewAction = "update" | "create" | "skip";

export interface ChunkPreviewItem {
  parsed: ParsedMaterial;
  action: ChunkPreviewAction;
  matchedMaterial: Material | null;
  index: number;
  llmResult?: { categoryId: string; unit: string };
  userOverride?: { categoryId?: string; unit?: string; name?: string };
}

export function matchChunkToMaterials(
  parsed: ParsedMaterial[],
  materials: Material[]
): ChunkPreviewItem[] {
  const byNormalized = new Map<string, Material[]>();
  for (const m of materials) {
    const key = normalizeForMatch(m.name);
    const arr = byNormalized.get(key) ?? [];
    arr.push(m);
    byNormalized.set(key, arr);
  }

  const result: ChunkPreviewItem[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const p = parsed[i];
    const key = normalizeForMatch(p.name);
    const matches = byNormalized.get(key) ?? [];
    const best =
      matches.length > 0
        ? [...matches].sort((a, b) => {
            const ta = new Date(a.updated_at).getTime();
            const tb = new Date(b.updated_at).getTime();
            if (tb !== ta) return tb - ta;
            const na = Number(a.id);
            const nb = Number(b.id);
            if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na;
            return b.id.localeCompare(a.id, undefined, { numeric: true });
          })[0]
        : null;

    let action: ChunkPreviewAction = best ? "update" : "create";
    if (best && p.price != null && Math.abs(p.price - best.price) < 0.01) {
      action = "skip";
    }

    result.push({
      parsed: p,
      action,
      matchedMaterial: best,
      index: i,
    });
  }
  return result;
}
