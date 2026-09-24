import type { ParsedMaterial } from "./chunk-parser";
import type { Material } from "@/types/material";
import { identityChanged, priceJumps, sourceLinkKey, type HoldReason } from "./import-guard";
import { hygieneMatchKey, cleanDisplayName } from "./name-hygiene";

export function normalizeForMatch(name: string): string {
  return hygieneMatchKey(name);
}

export type ChunkPreviewAction = "update" | "create" | "skip" | "hold";

const PENDING_ID_PREFIX = "__pending_";

export function isPendingMaterialId(id: string): boolean {
  return id.startsWith(PENDING_ID_PREFIX);
}

export interface ChunkPreviewItem {
  parsed: ParsedMaterial;
  action: ChunkPreviewAction;
  matchedMaterial: Material | null;
  index: number;
  llmResult?: { categoryId: string; unit: string };
  userOverride?: { categoryId?: string; unit?: string; name?: string };
  holdReason?: HoldReason;
}

function pickLatest(matches: Material[]): Material | null {
  const real = matches.filter((material) => !isPendingMaterialId(material.id));
  if (real.length === 0) return null;
  return [...real].sort((a, b) => {
    const ta = new Date(a.updated_at).getTime();
    const tb = new Date(b.updated_at).getTime();
    if (tb !== ta) return tb - ta;
    const na = Number(a.id);
    const nb = Number(b.id);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return nb - na;
    return b.id.localeCompare(a.id, undefined, { numeric: true });
  })[0];
}

function decideAction(
  material: Material | null,
  price: number | null,
  incomingName: string
): { action: ChunkPreviewAction; holdReason?: HoldReason } {
  if (!material) return { action: "create" };
  if (identityChanged(material.name, incomingName)) return { action: "hold", holdReason: "identity" };
  if (price != null && priceJumps(material.price, price)) return { action: "hold", holdReason: "price" };
  if (price != null && Math.abs(price - material.price) < 0.01) return { action: "skip" };
  return { action: "update" };
}

export function matchChunkToMaterials(
  parsed: ParsedMaterial[],
  materials: Material[],
  links: Record<string, string> = {}
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
    const p = { ...parsed[i], name: cleanDisplayName(parsed[i].name) };
    const key = normalizeForMatch(p.name);
    const linkId =
      p.source && p.sourceProductId
        ? links[sourceLinkKey(p.source, p.sourceProductId)]
        : undefined;
    const linked = linkId ? materials.find((material) => material.id === linkId) ?? null : null;
    const best = linked ?? pickLatest(byNormalized.get(key) ?? []);
    const decision = decideAction(best, p.price, p.name);

    result.push({
      parsed: p,
      action: decision.action,
      holdReason: decision.holdReason,
      matchedMaterial: best,
      index: i,
    });

    if (decision.action === "create") {
      const pending: Material = {
        id: `${PENDING_ID_PREFIX}${i}`,
        name: p.name,
        description: p.sectionContext ?? "",
        price: p.price ?? 0,
        unit: p.unit || "u",
        brand: null,
        unquoted: false,
        temporary: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        delete_at: null,
      };
      const pendingMatches = byNormalized.get(key) ?? [];
      pendingMatches.push(pending);
      byNormalized.set(key, pendingMatches);
    }
  }
  return result;
}
