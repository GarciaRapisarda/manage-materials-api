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
  const createdAt =
    r.created_at != null && r.created_at !== ""
      ? String(r.created_at)
      : r.createdAt != null && r.createdAt !== ""
        ? String(r.createdAt)
        : "";
  const updatedAt =
    r.updated_at != null && r.updated_at !== ""
      ? String(r.updated_at)
      : r.updatedAt != null && r.updatedAt !== ""
        ? String(r.updatedAt)
        : "";
  const deleteRaw = r.delete_at ?? r.deleteAt;
  return {
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    description: String(r.description ?? ""),
    created_at: createdAt,
    updated_at: updatedAt,
    delete_at:
      deleteRaw == null || deleteRaw === "" ? null : String(deleteRaw),
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
