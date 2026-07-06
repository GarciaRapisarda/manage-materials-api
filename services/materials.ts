import {
  API_BASE_URL,
  CATEGORY_MATERIALS_DEFAULT_PAGE_SIZE,
  CATEGORY_MATERIALS_MAX_PAGE_SIZE,
  categoryMaterialsPath,
} from "@/config/api";
import type {
  CategoryMaterialsPageResult,
  CategoryMaterialsQuery,
  Material,
  MaterialsApiResponse,
} from "@/types/material";

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
  const createdAt = firstNonEmptyString(r.created_at, r.createdAt);
  const updatedAt = firstNonEmptyString(r.updated_at, r.updatedAt);
  const deleteAt = firstNonEmptyString(r.delete_at, r.deleteAt);
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
    created_at: createdAt ?? "",
    updated_at: updatedAt ?? "",
    delete_at: deleteAt,
  };
}

function resolveCategoryIdFromPayload(
  record: Record<string, unknown>,
  fallbackCategoryId?: string
): string {
  const nested = record.category;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const cat = nested as Record<string, unknown>;
    const fromCategory = firstNonEmptyString(cat.id, cat.categoryId);
    if (fromCategory) return fromCategory;
  }
  const fromRoot = firstNonEmptyString(record.id);
  if (fromRoot) return fromRoot;
  return fallbackCategoryId ?? "";
}

function mapMaterialRows(
  rows: unknown[],
  categoryId: string
): Material[] {
  return rows.map((row) => {
    const material = normalizeMaterialFromApi(row);
    return {
      ...material,
      categoryId: material.categoryId || categoryId || null,
    };
  });
}

function readPositiveInt(...candidates: unknown[]): number | undefined {
  for (const v of candidates) {
    if (v == null || v === "") continue;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isNaN(n) && n > 0) return Math.floor(n);
  }
  return undefined;
}

function parseCategoryMaterialsPayload(
  payload: unknown,
  fallbackCategoryId: string,
  requestedPage: number,
  requestedPageSize: number
): Omit<CategoryMaterialsPageResult, "message"> {
  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const categoryId = resolveCategoryIdFromPayload(record, fallbackCategoryId);
  const data = extractMaterialsFromApiPayload(payload, fallbackCategoryId);

  const page =
    readPositiveInt(record.page, record.currentPage) ?? requestedPage;
  const pageSize =
    readPositiveInt(record.pageSize, record.page_size, record.limit) ??
    requestedPageSize;
  const total = readPositiveInt(
    record.total,
    record.totalCount,
    record.totalItems,
    record.count
  );
  let totalPages = readPositiveInt(record.totalPages, record.total_pages);
  if (!totalPages && total != null && pageSize > 0) {
    totalPages = Math.ceil(total / pageSize);
  }

  const hasMore =
    totalPages != null ? page < totalPages : data.length >= pageSize;

  return {
    data,
    page,
    pageSize,
    total,
    totalPages,
    hasMore,
  };
}

function buildCategoryMaterialsUrl(
  categoryId: string,
  query?: CategoryMaterialsQuery
): string {
  const base = `${API_BASE_URL}/${categoryMaterialsPath(categoryId)}`;
  const params = new URLSearchParams();
  const page = query?.page ?? 1;
  const pageSize = Math.min(
    CATEGORY_MATERIALS_MAX_PAGE_SIZE,
    query?.pageSize ?? CATEGORY_MATERIALS_DEFAULT_PAGE_SIZE
  );
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  const q = query?.q?.trim();
  if (q) params.set("q", q);
  return `${base}?${params.toString()}`;
}

function extractMaterialsFromApiPayload(
  payload: unknown,
  fallbackCategoryId?: string
): Material[] {
  if (Array.isArray(payload)) {
    return mapMaterialRows(payload, fallbackCategoryId ?? "");
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const categoryId = resolveCategoryIdFromPayload(record, fallbackCategoryId);

    const items = record.items;
    if (Array.isArray(items)) {
      return mapMaterialRows(items, categoryId);
    }

    const materials = record.materials;
    if (Array.isArray(materials)) {
      return mapMaterialRows(materials, categoryId);
    }
  }

  return [];
}

export async function fetchMaterialsByCategoryPage(
  categoryId: string,
  token: string,
  query?: CategoryMaterialsQuery
): Promise<CategoryMaterialsPageResult> {
  const page = query?.page ?? 1;
  const pageSize = Math.min(
    CATEGORY_MATERIALS_MAX_PAGE_SIZE,
    query?.pageSize ?? CATEGORY_MATERIALS_DEFAULT_PAGE_SIZE
  );
  const res = await fetch(buildCategoryMaterialsUrl(categoryId, { ...query, page, pageSize }), {
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
  const parsed = parseCategoryMaterialsPayload(
    json.data,
    categoryId,
    page,
    pageSize
  );
  return {
    message: String(json.message ?? ""),
    ...parsed,
  };
}

export async function fetchMaterialsByCategory(
  categoryId: string,
  token: string,
  query?: CategoryMaterialsQuery
): Promise<CategoryMaterialsPageResult> {
  return fetchMaterialsByCategoryPage(categoryId, token, query);
}

async function fetchMaterialsAllPages(
  headers?: HeadersInit
): Promise<MaterialsApiResponse> {
  const pageSize = CATEGORY_MATERIALS_MAX_PAGE_SIZE;
  const allMaterials: Material[] = [];
  let message = "";
  let page = 1;

  while (true) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });
    const res = await fetch(
      `${API_BASE_URL}/materials/all?${params.toString()}`,
      { headers }
    );
    if (!res.ok) {
      throw new Error(`Error ${res.status}: ${res.statusText}`);
    }

    const json = (await res.json()) as { message?: unknown; data?: unknown };
    message = String(json.message ?? message);

    if (Array.isArray(json.data)) {
      return {
        message,
        data: mapMaterialRows(json.data, ""),
      };
    }

    const parsed = parseCategoryMaterialsPayload(
      json.data,
      "",
      page,
      pageSize
    );
    allMaterials.push(...parsed.data);

    if (!parsed.hasMore) break;
    page++;
  }

  return { message, data: allMaterials };
}

export async function fetchAllMaterials(
  token?: string
): Promise<MaterialsApiResponse> {
  const headers: HeadersInit = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return fetchMaterialsAllPages(headers);
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
