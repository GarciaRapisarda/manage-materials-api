import type { ParsedMaterial } from "./chunk-parser";

export interface AlumetalMaterial {
  name: string;
  description?: string;
  price: number;
  unit: string;
  brand: string | null;
  sourceCategory?: string;
  sourceUrl?: string;
  sourceProductId?: string;
  scrapedAt?: string;
}

export function alumetalToParsed(items: AlumetalMaterial[]): ParsedMaterial[] {
  return items.map((item) => ({
    name: item.name,
    price: item.price,
    unit: item.unit || "u",
    sectionContext: item.sourceCategory ?? null,
  }));
}
