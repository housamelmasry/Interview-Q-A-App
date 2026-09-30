/**
 * Shapes returned by the API. The wire format uses snake_case and the client
 * passes it straight through to the UI, so these types mirror the JSON exactly
 * rather than re-mapping it.
 */

export type Difficulty = "beginner" | "intermediate" | "advanced";

export interface Answer {
  id: number;
  answer_text: string;
}

export interface Question {
  id: number;
  question_text: string;
  category_id: string;
  category_label: string;
  icon: string;
  color: string;
  difficulty: Difficulty;
  tags: string[];
  answers: Answer[];
}

export interface Category {
  id: string;
  label: string;
  icon: string;
  color: string;
  question_count: number;
}

/** Envelope shared by every list endpoint, so pagination needs no extra call. */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface Stats {
  total_categories: number;
  total_questions: number;
  total_answers: number;
  categories: Category[];
}

// --- Request payloads -------------------------------------------------------

export interface CategoryInput {
  id: string;
  label: string;
  icon: string;
  color: string;
}

export interface AnswerInput {
  answer_text: string;
}

export interface QuestionInput {
  question_text: string;
  category_id: string;
  difficulty: Difficulty;
  tags: string[];
  answers: AnswerInput[];
}

/** Body every mutation answers with: a human readable message, plus a new id. */
export interface MutationResult {
  id?: number;
  message: string;
}
