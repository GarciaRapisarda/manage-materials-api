import { API_BASE_URL, CATEGORIES_PATH } from "@/config/api";
import type { Category, CategoriesApiResponse } from "@/types/category";

function asCategoryRecord(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

export function normalizeCategoryFromApi(raw: unknown): Category {
  const r = asCategoryRecord(raw);
  if (!r) {
    throw new Error("Categoría inválida: se esperaba un objeto");
  }
  return {
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    description: String(r.description ?? ""),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
    delete_at:
      r.delete_at == null || r.delete_at === ""
        ? null
        : String(r.delete_at),
  };
}

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

  const json = (await res.json()) as {
    message?: unknown;
    data?: unknown;
  };
  const rows = json.data;
  const data = Array.isArray(rows)
    ? rows.map((row) => normalizeCategoryFromApi(row))
    : [];
  return {
    message: String(json.message ?? ""),
    data,
  };
}
