export interface Material {
  id: string;
  categoryId?: string | null;
  name: string;
  description: string;
  price: number;
  unit: string;
  brand: string | null;
  unquoted: boolean;
  temporary: boolean;
  created_at: string;
  updated_at: string;
  delete_at: string | null;
}

export interface MaterialsApiResponse {
  message: string;
  data: Material[];
}

export interface CategoryMaterialsQuery {
  page?: number;
  pageSize?: number;
  q?: string;
}

export interface CategoryMaterialsPageResult {
  message: string;
  data: Material[];
  page: number;
  pageSize: number;
  total?: number;
  totalPages?: number;
  hasMore: boolean;
}
