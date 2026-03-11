export interface CategorizeItem {
  name: string;
  sectionContext?: string | null;
}

export interface CategorizeResult {
  categoryId: string;
  unit: string;
}

export async function categorizeMaterials(
  items: CategorizeItem[]
): Promise<CategorizeResult[]> {
  const res = await fetch("/api/categorize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Error al categorizar");
  }

  const data = (await res.json()) as { results: CategorizeResult[] };
  return data.results;
}
