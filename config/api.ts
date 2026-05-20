export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export const CATEGORIES_PATH =
  process.env.NEXT_PUBLIC_CATEGORIES_PATH ?? "category/all";

export function categoryMaterialsPath(categoryId: string): string {
  const id = encodeURIComponent(categoryId);
  return `category/materials/${id}`;
}
