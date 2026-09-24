import { variantsConflict } from "./name-review";

export type HoldReason = "price" | "identity";

export function sourceLinkKey(source: string, productId: string): string {
  return `${source}:${productId}`;
}

export function priceJumps(current: number, incoming: number): boolean {
  if (!(current > 0) || !(incoming > 0)) return false;
  const ratio = incoming / current;
  return ratio >= 2 || ratio <= 0.5;
}

function modelCodes(name: string): string[] {
  const text = name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");
  const found = text.match(/\b[a-z]{1,4}-?\d{2,4}\b/g) ?? [];
  return [...new Set(found.map((code) => code.replace(/-/g, "")))].sort();
}

export function identityChanged(currentName: string, incomingName: string): boolean {
  if (variantsConflict([currentName, incomingName])) return true;
  const currentCodes = modelCodes(currentName);
  const incomingCodes = modelCodes(incomingName);
  if (currentCodes.length === 0 || incomingCodes.length === 0) return false;
  return currentCodes.join("|") !== incomingCodes.join("|");
}
