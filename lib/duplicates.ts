export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export interface DuplicateGroupInfo {
  count: number;
  ids: string[];
}

function normalizeOptional(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().trim();
}

export function getDuplicateGroupsByNormalizedName<
  T extends { id: string; name: string; description?: string | null; brand?: string | null }
>(items: T[]): Map<string, DuplicateGroupInfo> {
  const byNormalized = new Map<string, string[]>();

  for (const item of items) {
    const key = `${normalizeName(item.name)}|${normalizeOptional(item.brand)}|${normalizeOptional(item.description)}`;
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

export function getDuplicateCleanupSelection(
  duplicateGroups: Map<string, DuplicateGroupInfo>
): DuplicateCleanupSelection {
  const toSelect = new Set<string>();
  const toKeep = new Set<string>();
  const processed = new Set<string>();

  for (const [, info] of duplicateGroups) {
    const key = [...info.ids].sort().join(",");
    if (processed.has(key)) continue;
    processed.add(key);

    const sorted = [...info.ids].sort(compareIds);
    const kept = sorted[0];
    toKeep.add(kept);
    for (let i = 1; i < sorted.length; i++) {
      toSelect.add(sorted[i]);
    }
  }
  return { toSelect, toKeep };
}
