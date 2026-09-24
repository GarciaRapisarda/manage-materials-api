import { canonicalDuplicateKey, keepLatestId } from "./duplicate-review";
import { cleanDisplayName, hygieneMatchKey } from "./name-hygiene";

export type NameReviewMember = {
  id: string;
  name: string;
  price: number;
  updatedAt: string;
};

export type NameReviewGroup = {
  source: "mechanical" | "llm";
  keepId: string;
  deleteIds: string[];
  cleanName: string;
  members: NameReviewMember[];
};

export type NameLlmCandidate = {
  id: string;
  items: NameReviewMember[];
};

type Item = NameReviewMember & { brand?: string | null };

const COLOR_WORDS = [
  "blanco", "negro", "gris", "rojo", "azul", "verde", "amarillo", "beige", "marron", "bordo",
  "marfil", "crema", "grafito", "celeste", "cobre", "bronce", "oro", "plata", "inox", "cromo",
  "bianco", "nero", "grigio", "habano", "caoba", "nogal", "wengue", "roble", "cedro", "natural",
];

function plain(name: string): string {
  return cleanDisplayName(name).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
}

function calidadMark(text: string): string {
  const grade = text.match(/\b(\d+)\s*(?:°|º|da|ra|er)?\s*calidad\b/) ?? text.match(/\b(primera|segunda|tercera)\s+calidad\b/);
  if (grade) return grade[0].replace(/\s+/g, "");
  return text.includes("calidad") ? "calidad" : "";
}

function manoMark(text: string): string {
  const izquierda = /\bizquierd|\bizq\b/.test(text);
  const derecha = /\bderech|\bder\b/.test(text);
  if (izquierda && derecha) return "ambas";
  if (izquierda) return "izq";
  if (derecha) return "der";
  return "";
}

function colorMark(text: string): string {
  return COLOR_WORDS.filter((color) => new RegExp(`\\b${color}\\b`).test(text)).sort().join(",");
}

export function variantsConflict(names: string[]): boolean {
  const rows = names.map((name) => {
    const text = plain(name);
    return { calidad: calidadMark(text), mano: manoMark(text), color: colorMark(text) };
  });
  const distinct = (values: string[]) => new Set(values).size > 1;
  return distinct(rows.map((row) => row.calidad)) || distinct(rows.map((row) => row.mano)) || distinct(rows.map((row) => row.color));
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

function toGroup(items: Item[], source: "mechanical" | "llm", cleanName?: string): NameReviewGroup {
  const keepId = keepLatestId(items.map((item) => item.id), (id) => items.find((item) => item.id === id)?.updatedAt ?? "");
  const keeper = items.find((item) => item.id === keepId) ?? items[0];
  return {
    source,
    keepId,
    deleteIds: items.map((item) => item.id).filter((id) => id !== keepId),
    cleanName: cleanName ?? cleanDisplayName(keeper.name),
    members: items.map(({ id, name, price, updatedAt }) => ({ id, name, price, updatedAt })),
  };
}

export function buildNameReview(items: Item[]): {
  mechanical: NameReviewGroup[];
  llm: NameLlmCandidate[];
} {
  const buckets = new Map<string, Item[]>();
  for (const item of items) {
    const key = hygieneMatchKey(item.name);
    const list = buckets.get(key) ?? [];
    list.push(item);
    buckets.set(key, list);
  }

  const mechanical: NameReviewGroup[] = [];
  const consumed = new Set<string>();
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    mechanical.push(toGroup(list, "mechanical"));
    list.forEach((item) => consumed.add(item.id));
  }

  const loose = items.filter((item) => !consumed.has(item.id)).map((item) => {
    const canonical = canonicalDuplicateKey(cleanDisplayName(item.name));
    return { item, ...canonical };
  });

  const llm: NameLlmCandidate[] = [];
  let seq = 0;
  const pushCluster = (cluster: Item[]) => {
    if (cluster.length < 2 || cluster.length > 6) return;
    if (variantsConflict(cluster.map((item) => item.name))) return;
    seq++;
    llm.push({
      id: `llm-${seq}`,
      items: cluster.map(({ id, name, price, updatedAt }) => ({ id, name, price, updatedAt })),
    });
  };

  const measured = loose.filter((row) => row.measure);
  const parent = new Map<string, string>();
  const findId = (id: string): string => {
    const current = parent.get(id) ?? id;
    if (current === id) return id;
    const root = findId(current);
    parent.set(id, root);
    return root;
  };
  const uniteIds = (a: string, b: string) => {
    const ra = findId(a);
    const rb = findId(b);
    if (ra !== rb) parent.set(rb, ra);
  };

  const byCanonical = new Map<string, Array<(typeof loose)[number]>>();
  const byToken = new Map<string, Array<(typeof loose)[number]>>();
  for (const row of measured) {
    parent.set(row.item.id, row.item.id);
    const canonicalList = byCanonical.get(`${row.measure}||${row.key}`) ?? [];
    canonicalList.push(row);
    byCanonical.set(`${row.measure}||${row.key}`, canonicalList);
    for (const token of row.tokens) {
      const tokenKey = `${row.measure}||${token}`;
      const tokenList = byToken.get(tokenKey) ?? [];
      tokenList.push(row);
      byToken.set(tokenKey, tokenList);
    }
  }
  for (const list of byCanonical.values()) {
    for (let i = 1; i < list.length; i++) uniteIds(list[0].item.id, list[i].item.id);
  }
  for (const row of measured) {
    let rarest: Array<(typeof loose)[number]> | null = null;
    for (const token of row.tokens) {
      const bucket = byToken.get(`${row.measure}||${token}`) ?? [];
      if (bucket.length < 2 || bucket.length > 80) continue;
      if (!rarest || bucket.length < rarest.length) rarest = bucket;
    }
    if (!rarest) continue;
    for (const other of rarest) {
      if (other.item.id === row.item.id) continue;
      const { shared, diff } = tokenSymDiff(row.tokens, other.tokens);
      if (shared >= 3 && diff > 0 && diff <= 2) uniteIds(row.item.id, other.item.id);
    }
  }

  const clusters = new Map<string, Item[]>();
  for (const row of measured) {
    const root = findId(row.item.id);
    const cluster = clusters.get(root) ?? [];
    cluster.push(row.item);
    clusters.set(root, cluster);
  }
  for (const cluster of clusters.values()) pushCluster(cluster);

  const bareByUnit = new Map<string, Array<(typeof loose)[number]>>();
  for (const row of loose) {
    if (row.measure) continue;
    for (const token of row.tokens) {
      const list = bareByUnit.get(token) ?? [];
      list.push(row);
      bareByUnit.set(token, list);
    }
  }
  for (const row of measured) {
    if (!/^1[a-z0-9]+$/.test(row.measure)) continue;
    const unit = row.measure.slice(1);
    const bare = (bareByUnit.get(unit) ?? []).filter((candidate) => {
      if ((bareByUnit.get(unit) ?? []).length > 80) return false;
      const bareTokens = candidate.tokens.filter((token) => token !== unit);
      const { shared, diff } = tokenSymDiff(row.tokens, bareTokens);
      return shared >= 2 && diff <= 1;
    });
    if (bare.length === 0 || bare.length > 5) continue;
    pushCluster([row.item, ...bare.map((hit) => hit.item)]);
  }

  return { mechanical, llm };
}
