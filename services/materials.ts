import { API_BASE_URL } from "@/config/api";
import type { Material, MaterialsApiResponse } from "@/types/material";

function asMaterialRecord(raw: unknown): Record<string, unknown> | null {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

function firstNonEmptyString(...candidates: unknown[]): string | null {
  for (const v of candidates) {
    if (v == null || v === "") continue;
    return String(v);
  }
  return null;
}

function extractCategoryIdFromMaterialRecord(
  r: Record<string, unknown>
): string | null {
  const fromScalars = firstNonEmptyString(
    r.categoryId,
    r.category_id,
    r.CategoryId,
    r.categoryID,
    r.idCategory,
    r.id_category,
    r.fk_category_id,
    r.fkCategoryId
  );
  if (fromScalars) return fromScalars;

  const nested = r.category;
  if (typeof nested === "number") {
    return String(nested);
  }
  if (typeof nested === "string" && nested.trim() !== "") {
    return nested.trim();
  }
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const c = nested as Record<string, unknown>;
    const fromNested = firstNonEmptyString(
      c.id,
      c.category_id,
      c.categoryId
    );
    if (fromNested) return fromNested;
  }

  const cats = r.categories;
  if (Array.isArray(cats) && cats.length > 0) {
    const first = cats[0];
    if (first && typeof first === "object" && !Array.isArray(first)) {
      const c = first as Record<string, unknown>;
      const fromArr = firstNonEmptyString(
        c.id,
        c.category_id,
        c.categoryId
      );
      if (fromArr) return fromArr;
    }
  }

  return null;
}

export function normalizeMaterialFromApi(raw: unknown): Material {
  const r = asMaterialRecord(raw);
  if (!r) {
    throw new Error("Material inválido: se esperaba un objeto");
  }
  const categoryId = extractCategoryIdFromMaterialRecord(r);
  const brandRaw = r.brand;
  return {
    id: String(r.id ?? ""),
    categoryId,
    name: String(r.name ?? ""),
    description: String(r.description ?? ""),
    price:
      typeof r.price === "number" ? r.price : Number(r.price) || 0,
    unit: String(r.unit ?? ""),
    brand:
      brandRaw == null || brandRaw === "" ? null : String(brandRaw),
    unquoted: Boolean(r.unquoted),
    temporary: Boolean(r.temporary),
    created_at: String(r.created_at ?? ""),
    updated_at: String(r.updated_at ?? ""),
    delete_at:
      r.delete_at == null || r.delete_at === ""
        ? null
        : String(r.delete_at),
  };
}

export async function fetchAllMaterials(
  token: string
): Promise<MaterialsApiResponse> {
  const res = await fetch(`${API_BASE_URL}/materials/all`, {
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
    ? rows.map((row) => normalizeMaterialFromApi(row))
    : [];
  return {
    message: String(json.message ?? ""),
    data,
  };
}

export async function deleteMaterial(
  id: string,
  token: string
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/materials/${id}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Error ${res.status}: ${res.statusText}`);
  }
}

export async function patchMaterial(
  id: string,
  body: Record<string, unknown>,
  token: string
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${API_BASE_URL}/materials/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Error ${res.status}: ${res.statusText}`);
  }

  const contentType = res.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return (await res.json()) as Record<string, unknown>;
  }
  return null;
}

export async function createMaterial(
  body: {
    categoryId: string;
    name: string;
    description?: string;
    price?: number;
    unit?: string;
    brand?: string;
  },
  token: string
): Promise<Material> {
  const res = await fetch(`${API_BASE_URL}/materials/create`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      categoryId: body.categoryId,
      name: body.name,
      description: body.description ?? "",
      price: body.price ?? 0,
      unit: body.unit ?? "",
      brand: body.brand ?? "",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Error ${res.status}: ${res.statusText}`);
  }

  const json = (await res.json()) as { data?: unknown } | unknown;
  const raw =
    json && typeof json === "object" && "data" in json
      ? (json as { data: unknown }).data
      : json;
  return normalizeMaterialFromApi(raw);
}
