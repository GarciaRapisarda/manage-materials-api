import { normalizeForMaterialMatch } from "./material-name-match";

export function normalizeName(name: string): string {
  return normalizeForMaterialMatch(name);
}

export interface DuplicateGroupInfo {
  count: number;
  ids: string[];
}

function normalizeOptional(s: string | null | undefined): string {
  return normalizeForMaterialMatch(s ?? "");
}

export function getDuplicateGroupsByNormalizedName<
  T extends { id: string; name: string; description?: string | null; brand?: string | null }
>(items: T[]): Map<string, DuplicateGroupInfo> {
  const byNormalized = new Map<string, string[]>();

  for (const item of items) {
    const key = `${normalizeForMaterialMatch(item.name)}|${normalizeOptional(item.brand)}|${normalizeOptional(item.description)}`;
    const ids = byNormalized.get(key) ?? [];
    ids.push(item.id);
    byNormalized.set(key, ids);
  }

  const result = new Map<string, DuplicateGroupInfo>();
  for (const ids of byNormalized.values()) {
    if (ids.length > 1) {
      const info: DuplicateGroupInfo = { count: ids.length, ids };
      ids.forEach((id) => result.set(id, info));
    }
  }
  return result;
}

function compareIds(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a.localeCompare(b, undefined, { numeric: true });
}

export interface DuplicateCleanupSelection {
  toSelect: Set<string>;
  toKeep: Set<string>;
}

function compareUpdatedThenIdDesc(
  a: string,
  b: string,
  byId: Map<string, { updated_at: string }>
): number {
  const ua = byId.get(a)?.updated_at ?? "";
  const ub = byId.get(b)?.updated_at ?? "";
  const t = new Date(ub).getTime() - new Date(ua).getTime();
  if (t !== 0) return t;
  return compareIds(b, a);
}

export function getDuplicateCleanupSelection(
  duplicateGroups: Map<string, DuplicateGroupInfo>,
  materials: { id: string; updated_at: string }[]
): DuplicateCleanupSelection {
  const byId = new Map(materials.map((m) => [m.id, m]));
  const toSelect = new Set<string>();
  const toKeep = new Set<string>();
  const processed = new Set<string>();

  for (const [, info] of duplicateGroups) {
    const key = [...info.ids].sort().join(",");
    if (processed.has(key)) continue;
    processed.add(key);

    const sorted = [...info.ids].sort((a, b) =>
      compareUpdatedThenIdDesc(a, b, byId)
    );
    const kept = sorted[0];
    toKeep.add(kept);
    for (let i = 1; i < sorted.length; i++) {
      toSelect.add(sorted[i]);
    }
  }
  return { toSelect, toKeep };
}
