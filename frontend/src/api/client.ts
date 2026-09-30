import { PAGE_SIZE } from "../constants";
import type {
  AnswerInput,
  Category,
  CategoryInput,
  MutationResult,
  PaginatedResponse,
  Question,
  QuestionInput,
  Stats,
} from "./types";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

/** Error carrying the HTTP status so callers can distinguish 404 from 500. */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type QueryValue = string | number | undefined | null;

const buildUrl = (path: string, query: Record<string, QueryValue> = {}): string => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return `${API_URL}${path}${search ? `?${search}` : ""}`;
};

/**
 * Pulls the API's `{ error }` message out of a failed response so the banner
 * shows something actionable instead of a bare status code.
 */
const readError = async (response: Response): Promise<string> => {
  const body = (await response.json().catch(() => null)) as {
    error?: string;
  } | null;
  const message = body?.error?.trim();
  return message ? message : `Request failed (${response.status})`;
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new ApiError(await readError(response), response.status);
  return (await response.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export interface ListParams {
  page?: number;
  limit?: number;
  signal?: AbortSignal;
}

export interface QuestionListParams extends ListParams {
  category?: string;
}

export interface SearchListParams extends ListParams {
  term: string;
}

/** One page of questions, optionally narrowed to a single category. */
export const fetchQuestions = ({
  category,
  page = 1,
  limit = PAGE_SIZE,
  signal,
}: QuestionListParams = {}): Promise<PaginatedResponse<Question>> =>
  request<PaginatedResponse<Question>>(
    buildUrl("/api/questions", { category, page, limit }),
    { signal },
  );

/** Full-text search over question and answer text, paginated the same way. */
export const searchQuestions = ({
  term,
  page = 1,
  limit = PAGE_SIZE,
  signal,
}: SearchListParams): Promise<PaginatedResponse<Question>> =>
  request<PaginatedResponse<Question>>(
    buildUrl("/api/search", { q: term, page, limit }),
    { signal },
  );

export const fetchCategories = (
  signal?: AbortSignal,
): Promise<Category[]> => request<Category[]>(buildUrl("/api/categories"), { signal });

export const fetchStats = (signal?: AbortSignal): Promise<Stats> =>
  request<Stats>(buildUrl("/api/stats"), { signal });

export const createCategory = (input: CategoryInput): Promise<MutationResult> =>
  request<MutationResult>(buildUrl("/api/categories"), {
    method: "POST",
    ...json(input),
  });

export const updateCategory = (
  id: string,
  input: Omit<CategoryInput, "id">,
): Promise<MutationResult> =>
  request<MutationResult>(buildUrl(`/api/categories/${id}`), {
    method: "PUT",
    ...json(input),
  });

export const deleteCategory = (id: string): Promise<MutationResult> =>
  request<MutationResult>(buildUrl(`/api/categories/${id}`), {
    method: "DELETE",
  });

export const createQuestion = (input: QuestionInput): Promise<MutationResult> =>
  request<MutationResult>(buildUrl("/api/questions"), {
    method: "POST",
    ...json(input),
  });

/** `answers` is the complete desired set: the API replaces what is there. */
export const updateQuestion = (
  id: number,
  input: QuestionInput,
): Promise<MutationResult> =>
  request<MutationResult>(buildUrl(`/api/questions/${id}`), {
    method: "PUT",
    ...json(input),
  });

export const deleteQuestion = (id: number): Promise<MutationResult> =>
  request<MutationResult>(buildUrl(`/api/questions/${id}`), {
    method: "DELETE",
  });

export const updateAnswer = (
  id: number,
  input: AnswerInput,
): Promise<MutationResult> =>
  request<MutationResult>(buildUrl(`/api/answers/${id}`), {
    method: "PUT",
    ...json(input),
  });

export const deleteAnswer = (id: number): Promise<MutationResult> =>
  request<MutationResult>(buildUrl(`/api/answers/${id}`), {
    method: "DELETE",
  });
