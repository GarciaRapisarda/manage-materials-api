import { normalizeForMaterialMatch } from "./material-name-match";

export type DuplicateReviewItem = {
  id: string;
  name: string;
  brand?: string | null;
};

export type DuplicateMember = {
  id: string;
  name: string;
  price: number;
  updatedAt: string;
};

export type DuplicateReviewGroup = {
  source: "mechanical" | "llm";
  keepId: string;
  deleteIds: string[];
  names: string[];
  members: DuplicateMember[];
};

export type LlmCandidateGroup = {
  id: string;
  items: DuplicateReviewItem[];
};

const UNIT_ALIAS: Record<string, string> = {
  lt: "lt",
  lts: "lt",
  litro: "lt",
  litros: "lt",
  l: "lt",
  kg: "kg",
  gr: "gr",
  ml: "ml",
  cm: "cm",
  mm: "mm",
  mt: "mt",
  m: "mt",
  m2: "m2",
  m3: "m3",
};

function compareIds(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  return a.localeCompare(b, undefined, { numeric: true });
}

export function keepLowestId(ids: string[]): string {
  return [...ids].sort(compareIds)[0];
}

function prepareName(raw: string): string {
  return normalizeForMaterialMatch(raw)
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/\(\s*unidad(?:es)?\s*\)/g, " ")
    .replace(/\bunidad(?:es)?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeMeasures(input: string): { text: string; measures: string[] } {
  const measures: string[] = [];
  let text = input.replace(
    /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(cm|mm|mt|m)\b/g,
    (_m, a: string, b: string, unit: string) => {
      const token = `${a}x${b}${UNIT_ALIAS[unit] ?? unit}`;
      measures.push(token);
      return " ";
    }
  );
  text = text.replace(
    /(\d+)\s*\/\s*(\d+)(?:\s*(lt|lts|litros|litro|kg|gr|ml|cm|mm|mt|m2|m3|l|m)\b)?/g,
    (_m, a: string, b: string, unit?: string) => {
      measures.push(unit ? `${a}/${b}${UNIT_ALIAS[unit] ?? unit}` : `${a}/${b}`);
      return " ";
    }
  );
  text = text.replace(
    /(?:^|\s)x\s+(\d+(?:\.\d+)?)(?:\s*(lt|lts|litros|litro|kg|gr|ml|cm|mm|mt|m2|m3|l|m))?(?=\s|$)/g,
    (_m, num: string, unit?: string) => {
      const token = `${num}${unit ? UNIT_ALIAS[unit] ?? unit : ""}`;
      measures.push(token);
      return " ";
    }
  );
  text = text.replace(
    /(\d+(?:\.\d+)?)\s*(lt|lts|litros|litro|kg|gr|ml|cm|mm|mt|m2|m3|l|m)\b/g,
    (_m, num: string, unit: string) => {
      measures.push(`${num}${UNIT_ALIAS[unit] ?? unit}`);
      return " ";
    }
  );
  text = text.replace(/\bx\b/g, " ").replace(/\s+/g, " ").trim();
  return { text, measures };
}

export function canonicalDuplicateKey(name: string): {
  key: string;
  measure: string;
  tokens: string[];
} {
  const { text, measures } = canonicalizeMeasures(prepareName(name));
  const uniqueMeasures = [...new Set(measures)].sort();
  const tokens = text.split(" ").filter(Boolean);
  const key = [...tokens, ...uniqueMeasures].join(" ");
  return { key, measure: uniqueMeasures.join("|"), tokens };
}

function brandKey(brand: string | null | undefined): string {
  return normalizeForMaterialMatch(brand ?? "");
}

function tokenSymDiff(a: string[], b: string[]): { shared: number; diff: number } {
  const sa = new Set(a);
  const sb = new Set(b);
  let shared = 0;
  for (const token of sa) if (sb.has(token)) shared++;
  let diff = 0;
  for (const token of sa) if (!sb.has(token)) diff++;
  for (const token of sb) if (!sa.has(token)) diff++;
  return { shared, diff };
}

export function keepLatestId(
  ids: string[],
  updatedAt: (id: string) => string
): string {
  return [...ids].sort((a, b) => {
    const ta = new Date(updatedAt(a) || 0).getTime();
    const tb = new Date(updatedAt(b) || 0).getTime();
    if (tb !== ta) return tb - ta;
    return compareIds(a, b);
  })[0];
}

export function finishGroup(
  items: DuplicateReviewItem[],
  source: "mechanical" | "llm",
  membersById: Map<string, DuplicateMember>
): DuplicateReviewGroup {
  const ids = items.map((item) => item.id);
  const members = ids.map(
    (id) =>
      membersById.get(id) ?? {
        id,
        name: items.find((item) => item.id === id)?.name ?? id,
        price: 0,
        updatedAt: "",
      }
  );
  const keepId = keepLatestId(ids, (id) => membersById.get(id)?.updatedAt ?? "");
  return {
    source,
    keepId,
    deleteIds: ids.filter((id) => id !== keepId),
    names: members.map((member) => member.name),
    members,
  };
}

export function buildDuplicateCandidates(items: DuplicateReviewItem[]): {
  mechanical: DuplicateReviewGroup[];
  llm: LlmCandidateGroup[];
} {
  const buckets = new Map<string, DuplicateReviewItem[]>();
  for (const item of items) {
    const parsed = canonicalDuplicateKey(item.name);
    const bucket = `${brandKey(item.brand)}||${parsed.measure}||${parsed.key}`;
    const list = buckets.get(bucket) ?? [];
    list.push(item);
    buckets.set(bucket, list);
  }

  const mechanical: DuplicateReviewGroup[] = [];
  const consumed = new Set<string>();
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    mechanical.push(finishGroup(list, "mechanical", new Map()));
    list.forEach((item) => consumed.add(item.id));
  }

  const loose = new Map<string, DuplicateReviewItem[]>();
  for (const item of items) {
    if (consumed.has(item.id)) continue;
    const parsed = canonicalDuplicateKey(item.name);
    if (!parsed.measure) continue;
    const bucket = `${brandKey(item.brand)}||${parsed.measure}`;
    const list = loose.get(bucket) ?? [];
    list.push(item);
    loose.set(bucket, list);
  }

  const llm: LlmCandidateGroup[] = [];
  let llmSeq = 0;
  for (const list of loose.values()) {
    if (list.length < 2 || list.length > 8) continue;
    const parsed = list.map((item) => ({
      item,
      tokens: canonicalDuplicateKey(item.name).tokens,
    }));
    const parent = parsed.map((_, index) => index);
    const find = (index: number): number => {
      if (parent[index] !== index) parent[index] = find(parent[index]);
      return parent[index];
    };
    const unite = (a: number, b: number) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[rb] = ra;
    };
    for (let i = 0; i < parsed.length; i++) {
      for (let j = i + 1; j < parsed.length; j++) {
        const { shared, diff } = tokenSymDiff(parsed[i].tokens, parsed[j].tokens);
        if (shared >= 3 && diff > 0 && diff <= 2) unite(i, j);
      }
    }
    const clusters = new Map<number, DuplicateReviewItem[]>();
    parsed.forEach((row, index) => {
      const root = find(index);
      const cluster = clusters.get(root) ?? [];
      cluster.push(row.item);
      clusters.set(root, cluster);
    });
    for (const cluster of clusters.values()) {
      if (cluster.length < 2 || cluster.length > 6) continue;
      llmSeq++;
      llm.push({ id: `llm-${llmSeq}`, items: cluster });
    }
  }

  return { mechanical, llm };
}
