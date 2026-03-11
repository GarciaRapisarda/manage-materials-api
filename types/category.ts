export interface Category {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  delete_at: string | null;
}

export interface CategoriesApiResponse {
  message: string;
  data: Category[];
}
