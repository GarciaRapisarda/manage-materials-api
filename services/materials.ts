import { API_BASE_URL } from "@/config/api";
import type { Material, MaterialsApiResponse } from "@/types/material";

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

  const json = await res.json();
  return json as MaterialsApiResponse;
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

  const json = (await res.json()) as { data?: Material } | Material;
  if (json && typeof json === "object" && "data" in json) {
    return json.data as Material;
  }
  return json as Material;
}
