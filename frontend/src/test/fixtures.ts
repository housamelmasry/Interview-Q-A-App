import type { Category, QuestionWithAnswers } from "../App";

export const categories: Category[] = [
  { id: "laravel-core", label: "Laravel Core", icon: "🔴", color: "#FF4444" },
  { id: "nodejs", label: "Node.js", icon: "🟡", color: "#F7DF1E" },
];

export const questions: QuestionWithAnswers[] = [
  {
    id: 1,
    question_text: "What is the service container?",
    category_id: "laravel-core",
    category_label: "Laravel Core",
    icon: "🔴",
    color: "#FF4444",
    answers: [
      { id: 1, question_id: 1, answer_text: "It resolves dependencies." },
      { id: 2, question_id: 1, answer_text: "Bindings live in providers." },
    ],
  },
  {
    id: 2,
    question_text: "Explain the event loop.",
    category_id: "laravel-core",
    category_label: "Laravel Core",
    icon: "🔴",
    color: "#FF4444",
    answers: [
      { id: 3, question_id: 2, answer_text: "Phases: timers, poll, check." },
    ],
  },
  {
    id: 3,
    question_text: "How does the Node event loop work?",
    category_id: "nodejs",
    category_label: "Node.js",
    icon: "🟡",
    color: "#F7DF1E",
    answers: [{ id: 4, question_id: 3, answer_text: "Non-blocking I/O." }],
  },
];

const jsonResponse = (data: unknown, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => data,
});

/**
 * Stubs `fetch` so the categories and questions endpoints resolve with the
 * fixtures above and every other call is recorded for assertions.
 */
export function mockApi(overrides: { questions?: unknown[] } = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });

    if (url.endsWith("/api/categories")) {
      return jsonResponse(categories);
    }
    if (url.includes("/api/questions")) {
      return jsonResponse(overrides.questions ?? questions);
    }
    return jsonResponse({});
  });

  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, calls };
}

/** Stubs `fetch` so the initial load rejects, to exercise the error state. */
export function mockApiFailure(message = "Failed to fetch categories") {
  const fetchMock = vi.fn(async () => {
    throw new Error(message);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
