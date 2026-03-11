export interface ParsedMaterial {
  name: string;
  price: number | null;
  unit: string | null;
  sectionContext: string | null;
}

const PRICE_REGEX = /\$\s*([\d.]+),(\d{2})\s*$/;
const PRICE_ONLY_LINE = /^\s*\$\s*([\d.]+),(\d{2})\s*$/;
const PRICE_NO_SYMBOL = /(?:^|\s)([\d][\d.]*,\d{2})\s*$/;

const UNIT_PATTERNS: { regex: RegExp; unit: string }[] = [
  { regex: /\bx\s*kg\b/i, unit: "kg" },
  { regex: /\bx\s*gr\b/i, unit: "gr" },
  { regex: /\bx\s*m\b(?!\d)/i, unit: "mt" },
  { regex: /\bx\s*cm\b/i, unit: "cm" },
  { regex: /\bx\s*lt\b/i, unit: "l" },
  { regex: /\bx\s*l\b(?!\d)/i, unit: "l" },
  { regex: /\bx\s*ml\b/i, unit: "ml" },
  { regex: /\bx\s*m2\b/i, unit: "m2" },
  { regex: /\bx\s*m²\b/i, unit: "m2" },
  { regex: /\bx\s*cm2\b/i, unit: "cm2" },
  { regex: /\bx\s*m3\b/i, unit: "m3" },
  { regex: /\bx\s*m³\b/i, unit: "m3" },
  { regex: /\bx\s*cm3\b/i, unit: "cm3" },
  { regex: /\bc\/u\b/i, unit: "u" },
  { regex: /\bx\s*barra\b/i, unit: "u" },
  { regex: /\bx\s*100\s*u\b/i, unit: "u" },
  { regex: /\bx\s*\d+\s*kg\b/i, unit: "u" },
  { regex: /\bx\s*\d+\s*m\b/i, unit: "mt" },
  { regex: /\bx\s*m2\b/i, unit: "m2" },
];

function parseArgentinePrice(raw: string): number | null {
  const commaIdx = raw.lastIndexOf(",");
  if (commaIdx === -1) return null;
  const intPart = raw.slice(0, commaIdx).replace(/\./g, "");
  const decPart = raw.slice(commaIdx + 1);
  const num = parseFloat(intPart + "." + decPart);
  return Number.isNaN(num) ? null : num;
}

function extractPrice(line: string): number | null {
  const match = line.match(PRICE_REGEX);
  if (match) return parseArgentinePrice(`${match[1]},${match[2]}`);
  const soloMatch = line.match(PRICE_ONLY_LINE);
  if (soloMatch) return parseArgentinePrice(`${soloMatch[1]},${soloMatch[2]}`);
  const noSym = line.match(PRICE_NO_SYMBOL);
  if (noSym) return parseArgentinePrice(noSym[1]);
  return null;
}

function hasPrice(line: string): boolean {
  return PRICE_REGEX.test(line) || PRICE_ONLY_LINE.test(line) || PRICE_NO_SYMBOL.test(line);
}

function isPriceOnlyLine(line: string): boolean {
  return PRICE_ONLY_LINE.test(line.trim());
}

function extractUnit(text: string): string | null {
  for (const { regex, unit } of UNIT_PATTERNS) {
    if (regex.test(text)) return unit;
  }
  return null;
}

function cleanName(line: string): string {
  return line
    .replace(PRICE_REGEX, "")
    .replace(PRICE_NO_SYMBOL, "")
    .replace(/\s+sin\s+cotizar\s*$/i, "")
    .trim();
}

function isSectionHeader(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 95) return false;
  if (/[\d$]/.test(t)) return false;
  if (/^[A-Z][A-Z\s|\-–—]+(?:[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s\-]*)?$/.test(t)) return true;
  const letters = t.replace(/[\s|\-–—]/g, "");
  if (!letters) return false;
  const upperCount = (letters.match(/[A-ZÁÉÍÓÚÑ]/g) || []).length;
  return upperCount / letters.length > 0.65;
}

export function parseChunk(text: string): ParsedMaterial[] {
  const lines = text.split(/\r?\n/);
  const result: ParsedMaterial[] = [];
  let section: string | null = null;
  let nameBuffer: string[] = [];

  function emit(name: string, price: number | null, sec: string | null) {
    const n = name.trim();
    if (!n) return;
    result.push({
      name: n,
      price,
      unit: extractUnit(n),
      sectionContext: sec,
    });
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const t = line.trim();

    if (!t) {
      const next = lines[i + 1]?.trim();
      if (nameBuffer.length > 0 && next && isPriceOnlyLine(next)) {
        const name = cleanName(nameBuffer.join(" "));
        const price = extractPrice(next);
        emit(name, price, section);
        nameBuffer = [];
        i++;
      }
      continue;
    }

    if (isSectionHeader(t)) {
      if (nameBuffer.length > 0) {
        const last = nameBuffer.join(" ");
        if (hasPrice(last)) {
          emit(cleanName(last), extractPrice(last), section);
        }
        nameBuffer = [];
      }
      section = t;
      continue;
    }

    if (isPriceOnlyLine(t)) {
      if (nameBuffer.length > 0) {
        emit(cleanName(nameBuffer.join(" ")), extractPrice(t), section);
        nameBuffer = [];
      }
      continue;
    }

    if (hasPrice(t) || /sin\s+cotizar\s*$/i.test(t)) {
      if (nameBuffer.length > 0) {
        const last = nameBuffer[nameBuffer.length - 1];
        const endsWithContinuation = /[,\-–—(\s]$/.test(last);
        const currentIsShortSuffix = t.length < 45 && !/^(Alacena|Bajo|Cajonera|Caja|Puerta|Ventana|Split|Membrana|Placa|Cable|Caño|Masilla|Plavicon)\s/i.test(t);
        if (endsWithContinuation || currentIsShortSuffix) {
          nameBuffer.push(t);
          const full = nameBuffer.join(" ");
          emit(cleanName(full), extractPrice(full), section);
        } else {
          emit(cleanName(t), extractPrice(t), section);
        }
        nameBuffer = [];
      } else {
        emit(cleanName(t), extractPrice(t), section);
      }
      continue;
    }

    const next = lines[i + 1]?.trim();
    if (next && isPriceOnlyLine(next)) {
      nameBuffer.push(t);
      emit(cleanName(nameBuffer.join(" ")), extractPrice(next), section);
      nameBuffer = [];
      i++;
    } else {
      nameBuffer.push(t);
    }
  }

  if (nameBuffer.length > 0) {
    const last = nameBuffer.join(" ");
    if (hasPrice(last)) {
      emit(cleanName(last), extractPrice(last), section);
    }
  }

  return result;
}
