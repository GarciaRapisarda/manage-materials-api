import { readFileSync } from "fs";

const ACCENT_MAP = {
  á: "a", é: "e", í: "i", ó: "o", ú: "u", ñ: "n",
  Á: "a", É: "e", Í: "i", Ó: "o", Ú: "u", Ñ: "n",
};
const UNICODE_DASHES = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\ufe58\ufe63\uff0d]/g;

function normalizeForMaterialMatch(raw) {
  let s = raw
    .normalize("NFKC")
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/\u00a0|\u202f|\u2009|\u2007/g, " ")
    .replace(UNICODE_DASHES, "-")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
  for (const [accent, plain] of Object.entries(ACCENT_MAP)) {
    s = s.split(accent).join(plain);
  }
  s = s.replace(/[°º˚]/g, "°");
  s = s.replace(
    /(\d)\s*(?:[°º˚?]|['''′″"\u2032\u2033])+\s*x\b/gi,
    "$1°x"
  );
  s = s.replace(/\u00d7/g, "x");
  return s;
}

const items = JSON.parse(
  readFileSync("scripts/output/alumetal-materials.json", "utf8")
);
const target = items.find(
  (i) =>
    i.name.includes("PUAS 16") &&
    i.name.includes("500 mts") &&
    i.name.includes("ALTA RESISTENCIA")
);
console.log("JSON name chars:", [...target.name].map((c) => c + " U+" + c.codePointAt(0).toString(16)).join(" | "));
console.log("JSON normalized:", normalizeForMaterialMatch(target.name));

const dbNames = [
  "ALAMBRE PUAS 16 – 4?x 500 mts. ALTA RESISTENCIA BAGUAL",
  "ALAMBRE PUAS 16 - 4?x 500 mts. ALTA RESISTENCIA BAGUAL",
  "ALAMBRE PUAS 16 – 4″x 500 mts. ALTA RESISTENCIA BAGUAL",
];
for (const n of dbNames) {
  console.log("DB variant norm:", normalizeForMaterialMatch(n));
  console.log("  matches JSON:", normalizeForMaterialMatch(n) === normalizeForMaterialMatch(target.name));
}

const byKey = new Map();
for (const item of items) {
  const k = normalizeForMaterialMatch(item.name);
  const arr = byKey.get(k) ?? [];
  arr.push({ price: item.price, id: item.sourceProductId, name: item.name });
  byKey.set(k, arr);
}
const dupes = [...byKey.entries()].filter(([, v]) => v.length > 1);
console.log("Duplicate keys in alumetal JSON:", dupes.length);
if (dupes.length > 0) {
  console.log("First 3 dupes:", JSON.stringify(dupes.slice(0, 3), null, 2));
}

const ourKey = normalizeForMaterialMatch(target.name);
const alumetalDupes = byKey.get(ourKey);
console.log("Entries with same key as target:", alumetalDupes?.length ?? 0);
