import type { Category, PaginatedResponse, Question, Stats } from "../api/types";
import { PAGE_SIZE } from "../constants";

export const categories: Category[] = [
  {
    id: "laravel-core",
    label: "Laravel Core",
    icon: "🔴",
    color: "#FF4444",
    question_count: 2,
  },
  {
    id: "nodejs",
    label: "Node.js",
    icon: "🟡",
    color: "#F7DF1E",
    question_count: 1,
  },
];

export const questions: Question[] = [
  {
    id: 1,
    question_text: "What is the service container?",
    category_id: "laravel-core",
    category_label: "Laravel Core",
    icon: "🔴",
    color: "#FF4444",
    difficulty: "beginner",
    tags: ["container", "di"],
    answers: [
      { id: 1, answer_text: "It resolves dependencies." },
      { id: 2, answer_text: "Bindings live in providers." },
    ],
  },
  {
    id: 2,
    question_text: "Explain the event loop.",
    category_id: "laravel-core",
    category_label: "Laravel Core",
    icon: "🔴",
    color: "#FF4444",
    difficulty: "intermediate",
    tags: ["async"],
    answers: [{ id: 3, answer_text: "Phases: timers, poll, check." }],
  },
  {
    id: 3,
    question_text: "How does the Node event loop work?",
    category_id: "nodejs",
    category_label: "Node.js",
    icon: "🟡",
    color: "#F7DF1E",
    difficulty: "advanced",
    tags: ["nodejs", "async"],
    answers: [{ id: 4, answer_text: "Non-blocking I/O." }],
  },
];

/** A question with no tags, for asserting the empty tag row. */
export const untaggedQuestion: Question = {
  id: 4,
  question_text: "What is an event emitter?",
  category_id: "laravel-core",
  category_label: "Laravel Core",
  icon: "🔴",
  color: "#FF4444",
  difficulty: "intermediate",
  tags: [],
  answers: [{ id: 5, answer_text: "A class extending Node's EventEmitter." }],
};

/** Enough questions in one category to fill more than a single page. */
export const makeQuestion = (
  id: number,
  overrides: Partial<Question> = {},
): Question => ({
  id,
  question_text: `سؤال رقم ${id}`,
  category_id: "laravel-core",
  category_label: "Laravel Core",
  icon: "🔴",
  color: "#FF4444",
  difficulty: "beginner",
  tags: ["laravel"],
  answers: [{ id, answer_text: `إجابة ${id}` }],
  ...overrides,
});

export const makeQuestions = (count: number): Question[] =>
  Array.from({ length: count }, (_, index) => makeQuestion(index + 1));

export const paginate = <T,>(
  items: T[],
  page: number,
  limit: number,
): PaginatedResponse<T> => ({
  items: items.slice((page - 1) * limit, page * limit),
  total: items.length,
  page,
  limit,
  pages: Math.max(1, Math.ceil(items.length / limit)),
});

// --- Fake API ---------------------------------------------------------------

export interface ApiCall {
  url: string;
  path: string;
  method: string;
  query: URLSearchParams;
  body?: Record<string, unknown>;
  signal: AbortSignal | null;
}

export interface HeldResponse {
  path: string;
  query: URLSearchParams;
  /** Delivers the response the mock had already built. */
  resolve: () => void;
  /** Fails the request the way an aborted `fetch` would. */
  reject: () => void;
}

export interface FailureRule {
  method: string;
  path: string;
  status?: number;
  error?: string;
}

export interface MockApiOptions {
  questions?: Question[];
  categories?: Category[];
  stats?: Partial<Stats>;
  /** Rules that turn a request into an error response. */
  failures?: FailureRule[];
  /** Holds matching GET responses open so a test can land them out of order. */
  hold?: (path: string, query: URLSearchParams) => boolean;
}

interface ApiState {
  categories: Category[];
  questions: Question[];
}

interface MockResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

const json = (body: unknown, status = 200): MockResponse => ({
  ok: status < 400,
  status,
  json: async () => body,
});

const abortError = () => new DOMException("The operation was aborted.", "AbortError");

const readPage = (query: URLSearchParams) => ({
  page: Number(query.get("page")) || 1,
  limit: Number(query.get("limit")) || PAGE_SIZE,
});

const withCounts = (state: ApiState): Category[] =>
  state.categories.map((category) => ({
    ...category,
    question_count: state.questions.filter(
      (question) => question.category_id === category.id,
    ).length,
  }));

const buildStats = (state: ApiState): Stats => ({
  total_categories: state.categories.length,
  total_questions: state.questions.length,
  total_answers: state.questions.reduce(
    (total, question) => total + question.answers.length,
    0,
  ),
  categories: withCounts(state),
});

/** Every token has to appear somewhere, matching the API's AND semantics. */
const searchMatches = (source: Question[], term: string): Question[] => {
  const tokens = term.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  return source.filter((question) => {
    const haystack = [question.question_text, ...question.answers.map((a) => a.answer_text)]
      .join(" ")
      .toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
};

const nextAnswerId = (state: ApiState) =>
  state.questions.reduce((max, question) => {
    const highest = question.answers.reduce(
      (inner, answer) => Math.max(inner, answer.id),
      0,
    );
    return Math.max(max, highest);
  }, 0) + 1;

const nextQuestionId = (state: ApiState) =>
  state.questions.reduce((max, question) => Math.max(max, question.id), 0) + 1;

const categoryOf = (state: ApiState, id: string) =>
  state.categories.find((category) => category.id === id);

const handle = (call: ApiCall, state: ApiState, options: MockApiOptions): MockResponse => {
  const { path, method, query, body } = call;

  const failure = options.failures?.find(
    (rule) => rule.method === method && rule.path === path,
  );
  if (failure) {
    return json(
      { error: failure.error ?? "Request failed" },
      failure.status ?? 400,
    );
  }

  if (method === "GET" && path === "/api/categories") {
    return json(withCounts(state));
  }

  if (method === "GET" && path === "/api/stats") {
    return json({ ...buildStats(state), ...options.stats });
  }

  if (method === "GET" && path === "/api/questions") {
    const { page, limit } = readPage(query);
    const category = query.get("category");
    const filtered = category
      ? state.questions.filter((question) => question.category_id === category)
      : state.questions;
    return json(paginate(filtered, page, limit));
  }

  if (method === "GET" && path === "/api/search") {
    const { page, limit } = readPage(query);
    return json(paginate(searchMatches(state.questions, query.get("q") ?? ""), page, limit));
  }

  if (method === "POST" && path === "/api/questions") {
    const payload = body as unknown as Question;
    const category = categoryOf(state, payload.category_id);
    const question: Question = {
      id: nextQuestionId(state),
      question_text: payload.question_text,
      category_id: payload.category_id,
      category_label: category?.label ?? payload.category_id,
      icon: category?.icon ?? "",
      color: category?.color ?? "#666666",
      difficulty: payload.difficulty,
      tags: payload.tags,
      answers: [],
    };
    let answerId = nextAnswerId(state);
    question.answers = payload.answers
      .filter((answer) => answer.answer_text.trim())
      .map((answer) => ({ id: answerId++, answer_text: answer.answer_text }));
    state.questions.push(question);
    return json({ id: question.id, message: "Question added successfully" }, 201);
  }

  if (method === "PUT" && path.startsWith("/api/questions/")) {
    const id = Number(path.split("/").pop());
    const index = state.questions.findIndex((question) => question.id === id);
    if (index < 0) return json({ error: "Question not found" }, 404);
    const payload = body as unknown as Question;
    const category = categoryOf(state, payload.category_id);
    state.questions[index] = {
      ...state.questions[index],
      question_text: payload.question_text,
      category_id: payload.category_id,
      category_label: category?.label ?? payload.category_id,
      icon: category?.icon ?? "",
      color: category?.color ?? "#666666",
      difficulty: payload.difficulty,
      tags: payload.tags,
      answers: payload.answers.map((answer, position) => ({
        id: state.questions[index].answers[position]?.id ?? position + 1,
        answer_text: answer.answer_text,
      })),
    };
    return json({ message: "Question updated successfully" });
  }

  if (method === "DELETE" && path.startsWith("/api/questions/")) {
    const id = Number(path.split("/").pop());
    const before = state.questions.length;
    state.questions = state.questions.filter((question) => question.id !== id);
    if (state.questions.length === before) return json({ error: "Question not found" }, 404);
    return json({ message: "Question deleted successfully" });
  }

  if (method === "POST" && path === "/api/categories") {
    const payload = body as unknown as Category;
    state.categories.push({ ...payload, question_count: 0 });
    return json({ message: "Category added successfully" }, 201);
  }

  if (method === "PUT" && path.startsWith("/api/categories/")) {
    const id = path.split("/").pop() as string;
    const payload = body as unknown as Category;
    const index = state.categories.findIndex((category) => category.id === id);
    if (index < 0) return json({ error: "Category not found" }, 404);
    state.categories[index] = {
      ...state.categories[index],
      label: payload.label,
      icon: payload.icon,
      color: payload.color,
    };
    return json({ message: "Category updated successfully" });
  }

  if (method === "DELETE" && path.startsWith("/api/categories/")) {
    const id = path.split("/").pop() as string;
    const before = state.categories.length;
    state.categories = state.categories.filter((category) => category.id !== id);
    state.questions = state.questions.filter(
      (question) => question.category_id !== id,
    );
    if (state.categories.length === before) {
      return json({ error: "Category not found" }, 404);
    }
    return json({ message: "Category deleted successfully" });
  }

  if (method === "PUT" && path.startsWith("/api/answers/")) {
    return json({ message: "Answer updated successfully" });
  }

  if (method === "DELETE" && path.startsWith("/api/answers/")) {
    return json({ message: "Answer deleted successfully" });
  }

  return json({ error: `Unhandled request: ${method} ${path}` }, 404);
};

/**
 * Stubs `fetch` with an in-memory stand-in for the paginated API, so the
 * component tree can be exercised end to end: routing, query parameters and
 * mutation state all behave the way the real endpoints do.
 */
export function mockApi(options: MockApiOptions = {}) {
  const state: ApiState = {
    categories: options.categories ?? categories,
    questions: options.questions ?? questions,
  };
  const calls: ApiCall[] = [];
  const held: HeldResponse[] = [];

  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const path = new URL(url, "http://localhost:3000").pathname;
    const call: ApiCall = {
      url,
      path,
      method: (init?.method ?? "GET").toUpperCase(),
      query: new URL(url, "http://localhost:3000").searchParams,
      body: init?.body
        ? (JSON.parse(String(init.body)) as Record<string, unknown>)
        : undefined,
      signal: init?.signal ?? null,
    };
    calls.push(call);

    const response = handle(call, state, options);

    if (options.hold?.(path, call.query)) {
      return new Promise<MockResponse>((resolve, reject) => {
        held.push({
          path,
          query: call.query,
          resolve: () => resolve(response),
          reject: () => reject(abortError()),
        });
      });
    }

    if (call.signal?.aborted) return Promise.reject(abortError());
    return Promise.resolve(response);
  });

  vi.stubGlobal("fetch", fetchMock);

  const byPath = (path: string, method = "GET") =>
    calls.filter((call) => call.path === path && call.method === method);

  return {
    fetchMock,
    calls,
    held,
    state,
    questionCalls: () => byPath("/api/questions"),
    searchCalls: () => byPath("/api/search"),
  };
}

/** Stubs `fetch` so every request rejects, to exercise the error state. */
export function mockApiFailure(message = "Failed to fetch categories") {
  const fetchMock = vi.fn(async () => {
    throw new Error(message);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
