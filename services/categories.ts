import { API_BASE_URL, CATEGORIES_PATH } from "@/config/api";
import type { CategoriesApiResponse } from "@/types/category";

export async function fetchCategories(
  token: string
): Promise<CategoriesApiResponse> {
  const path = CATEGORIES_PATH.startsWith("/")
    ? CATEGORIES_PATH.slice(1)
    : CATEGORIES_PATH;
  const res = await fetch(`${API_BASE_URL}/${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Error ${res.status}: ${res.statusText}`);
  }

  const json = await res.json();
  return json as CategoriesApiResponse;
}
