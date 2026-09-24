import { normalizeForMaterialMatch } from "./material-name-match";

const UNICODE_DASHES = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\ufe58\ufe63\uff0d]/g;

function collapseRepeatedPhrase(input: string): string {
  let words = input.split(" ").filter(Boolean);
  let changed = true;
  while (changed) {
    changed = false;
    for (let size = Math.floor(words.length / 2); size >= 1; size--) {
      for (let i = 0; i + size * 2 <= words.length; i++) {
        const a = words.slice(i, i + size).join(" ").toLowerCase();
        const b = words.slice(i + size, i + size * 2).join(" ").toLowerCase();
        if (a !== b) continue;
        words = [...words.slice(0, i + size), ...words.slice(i + size * 2)];
        changed = true;
        break;
      }
      if (changed) break;
    }
  }
  return words.join(" ");
}

export function cleanDisplayName(raw: string): string {
  const spaced = raw
    .normalize("NFKC")
    .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
    .replace(/\u00a0|\u202f|\u2009|\u2007/g, " ")
    .replace(UNICODE_DASHES, "-")
    .replace(/\s+/g, " ")
    .trim();
  const stripped = spaced
    .replace(/\s*,\s*/g, " ")
    .replace(/\s+-\s+/g, " ")
    .replace(/^[\s-]+|[\s-]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return collapseRepeatedPhrase(stripped);
}

export function hygieneMatchKey(raw: string): string {
  return normalizeForMaterialMatch(cleanDisplayName(raw));
}
