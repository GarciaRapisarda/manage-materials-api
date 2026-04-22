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

const UNICODE_DASHES = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2212\ufe58\ufe63\uff0d]/g;

export function normalizeForMaterialMatch(raw: string): string {
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
  s = s.replace(/(\d)\s*\?\s*x\b/g, "$1°x");
  s = s.replace(/\u00d7/g, "x");
  return s;
}
