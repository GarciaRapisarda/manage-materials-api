import { isValidUnit } from "@/lib/units";

export function inferUnitFromName(name: string): string | null {
  const n = name.toLowerCase();
  if (/\bm2\b|x\s*m2|\/\s*m2|m²/i.test(n)) return "m2";
  if (/\bm3\b|x\s*m3|m³/i.test(n)) return "m3";
  if (/\bml\b/i.test(n)) return "ml";
  if (/\bx\s*\d+\s*l\b|\blt\b|litro/i.test(n) && !/\bml\b/i.test(n)) return "l";
  if (/\bx\s*\d+\s*kg\b|\bx\s*kg\b|\/\s*kg\b|por kg/i.test(n)) return "kg";
  if (/\bx\s*\d+\s*gr\b|\bgramo/i.test(n)) return "gr";
  if (
    /\bx\s*m\b|\bx\s*mt\b|\/\s*m\b|metro lineal|por metro/i.test(n) &&
    !/\bm2\b|\bm3\b/i.test(n)
  )
    return "mt";
  if (/\bx\s*cm\b/i.test(n)) return "cm";
  return null;
}

export function normalizeImportUnit(unit: string): string {
  let u = unit.toLowerCase().trim();
  if (u === "m") u = "mt";
  if (!isValidUnit(u)) return "u";
  return u;
}

export function applyRuleOverrides(
  name: string,
  categoryId: string,
  unit: string
): { categoryId: string; unit: string } {
  const n = name.toLowerCase();
  let cat = categoryId;
  let u = normalizeImportUnit(unit);

  if (/\bcemento\b|\bcal\s+(viva|hidratada|hidr)/i.test(n)) {
    cat = "5";
    if (/\bx\s*(\d+)\s*kg\b/i.test(n)) u = "u";
    else if (/\bx\s*kg\b/i.test(n)) u = "kg";
  }
  if (
    /\bchapa\s+acanalada|\bchapa\s+trapezoidal|\bchapa\s+cinzalum|\bcincalum\b/i.test(
      n
    ) &&
    /\bx\s*m\b/i.test(n)
  ) {
    cat = "10";
    u = "mt";
  }
  if (/\bcaño\s+estructural\b/i.test(n)) {
    cat = "17";
    if (/\bx\s*kg\b/i.test(n)) u = "kg";
  }
  if (/\blana\s+de\s+vidrio\b/i.test(n) && /\bm2\b|x\s*m2/i.test(n)) {
    cat = "1";
    u = "m2";
  }
  if (/\bsplit\b/i.test(n) && !/\b(calefacción|radiador)\b/i.test(n)) {
    cat = "14";
    u = "u";
  }
  if (/\bcalefactor\b|\bsombrilla\s+a\s*gas\b/i.test(n)) {
    cat = "26";
  }
  if (/\bhidrófugo\b|\bhidrofugo\b/i.test(n)) {
    cat = "1";
    if (/\bx\s*(\d+)\s*kg\b/i.test(n)) u = "u";
  }
  if (
    /\bporcelanato\b|\bcerámico\b.*\d+\s*x\s*\d+|\bpiso\s+vinílico\b|\bpiso\s+flotante\b/i.test(
      n
    ) &&
    !/\bmuro\b|\bportante\b|\btabique\b|\bdoble\s+muro\b/i.test(n)
  ) {
    cat = "25";
    if (/\bm2\b|x\s*m2|\/\s*m2/i.test(n)) u = "m2";
  }
  if (
    /\bcerámico\s+rosario\b|\badoquín\b|\bbrimax\b|\bsphan\s*-?\s*c\/u/i.test(
      n
    ) ||
    (/\bcerámico\b|\bladrillo\b|\bbloque\b/i.test(n) &&
      /\bmuro\b|\bportante\b|\btabique\b|\bc\/u\b/i.test(n))
  ) {
    cat = "21";
    u = "u";
  }

  return { categoryId: cat, unit: u };
}

export function enrichFromMappedContext(
  name: string,
  sectionContext: string | null | undefined,
  parsedUnit: string | null,
  resolveCategoryId: (categoryName: string) => string
): { categoryId: string; unit: string } | null {
  const ctx = sectionContext?.trim() ?? "";
  if (!ctx) return null;

  const categoryId = resolveCategoryId(ctx);
  if (!categoryId) return null;

  const hinted = inferUnitFromName(name);
  const unitRaw = parsedUnit?.trim() ?? "";
  const base =
    unitRaw && unitRaw !== "u" ? unitRaw : (hinted ?? unitRaw) || "u";

  return applyRuleOverrides(name, categoryId, base);
}
