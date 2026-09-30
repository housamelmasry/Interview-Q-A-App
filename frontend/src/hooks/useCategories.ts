import { fetchCategories } from "../api/client";
import type { Category } from "../api/types";
import { useResource } from "./useResource";

/** Categories from `/api/categories`, each carrying its `question_count`. */
export function useCategories() {
  const resource = useResource<Category[]>(fetchCategories, []);
  return { ...resource, categories: resource.data };
}
