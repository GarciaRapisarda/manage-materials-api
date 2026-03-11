import type { ParsedMaterial } from "./chunk-parser";
import type { Material } from "@/types/material";

const ACCENT_MAP: Record<string, string> = {
  á: "a",
  é: "e",
  í: "i",
  ó: "o",
  ú: "u",
  ñ: "n",
  Á: "a",
  É: "e",
  Í: "i",
  Ó: "o",
  Ú: "u",
  Ñ: "n",
};

export function normalizeForMatch(name: string): string {
  let s = name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
  for (const [accent, plain] of Object.entries(ACCENT_MAP)) {
    s = s.replace(new RegExp(accent, "g"), plain);
  }
  return s;
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
    const best = matches.length > 0
      ? [...matches].sort((a, b) => Number(a.id) - Number(b.id))[0]
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
