import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import type { Question } from "./api/types";
import { PAGE_SIZE, SEARCH_DEBOUNCE_MS } from "./constants";
import type { ApiCall } from "./test/fixtures";
import {
  categories,
  makeQuestion,
  makeQuestions,
  mockApi,
  mockApiFailure,
  untaggedQuestion,
} from "./test/fixtures";

const renderApp = () => render(<App />);

const lastCall = (calls: ApiCall[]) => calls[calls.length - 1];

const enterManageMode = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(await screen.findByRole("button", { name: /وضع الإدارة/ }));
};

const openQuestion = async (user: ReturnType<typeof userEvent.setup>, id: number) => {
  await user.click(await screen.findByTestId(`question-toggle-${id}`));
};

describe("initial load", () => {
  it("shows a loading state before data arrives", async () => {
    mockApi();
    renderApp();
    expect(screen.getByText("جاري التحميل...")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByTestId("loading-screen")).not.toBeInTheDocument(),
    );
  });

  it("asks for categories, stats and a first page of questions", async () => {
    const { calls, questionCalls } = mockApi();
    renderApp();

    await waitFor(() => expect(questionCalls()).toHaveLength(1));
    expect(calls[0].url).toBe("http://localhost:3000/api/categories");
    expect(calls.map((call) => call.path)).toContain("/api/stats");
    expect(questionCalls()[0].url).toBe(
      `http://localhost:3000/api/questions?category=laravel-core&page=1&limit=${PAGE_SIZE}`,
    );
  });

  it("renders the site totals from /api/stats", async () => {
    mockApi();
    renderApp();

    expect(await screen.findByTestId("stat-questions")).toHaveTextContent("3 سؤال");
    expect(screen.getByTestId("stat-answers")).toHaveTextContent("4 إجابة");
    expect(screen.getByTestId("stat-categories")).toHaveTextContent("2 تصنيف");
    expect(screen.getByText(/سؤال وإجابة موثّقة/)).toBeInTheDocument();
  });

  it("surfaces an error banner when the API is unreachable", async () => {
    mockApiFailure("Failed to fetch categories");
    renderApp();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Failed to fetch categories");
    expect(within(alert).getByText("إعادة المحاولة")).toBeInTheDocument();
  });

  it("retries the request when the retry button is pressed", async () => {
    const user = userEvent.setup();
    mockApiFailure();
    renderApp();

    const alert = await screen.findByRole("alert");
    vi.unstubAllGlobals();
    const { calls } = mockApi();

    await user.click(within(alert).getByText("إعادة المحاولة"));
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(2));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(
      await screen.findByText("What is the service container?"),
    ).toBeInTheDocument();
  });

  it("can dismiss the error banner", async () => {
    const user = userEvent.setup();
    mockApiFailure();
    renderApp();

    const alert = await screen.findByRole("alert");
    await user.click(within(alert).getByLabelText("Dismiss error"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("category navigation", () => {
  it("renders a tab per category with the count from the API", async () => {
    mockApi();
    renderApp();

    const tab = await screen.findByTestId("category-tab-laravel-core");
    expect(tab).toHaveTextContent("(2)");
    expect(screen.getByTestId("category-tab-nodejs")).toHaveTextContent("(1)");
  });

  it("only lists questions from the active category", async () => {
    mockApi();
    renderApp();

    expect(
      await screen.findByText("What is the service container?"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("How does the Node event loop work?"),
    ).not.toBeInTheDocument();
  });

  it("asks the API for the newly selected category", async () => {
    const user = userEvent.setup();
    const { questionCalls } = mockApi();
    renderApp();

    await user.click(await screen.findByTestId("category-tab-nodejs"));

    expect(
      await screen.findByText("How does the Node event loop work?"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("What is the service container?"),
    ).not.toBeInTheDocument();
    expect(lastCall(questionCalls()).query.get("category")).toBe("nodejs");
  });

  it("falls back to the first category when the default one no longer exists", async () => {
    const { questionCalls } = mockApi({ categories: [categories[1]] });
    renderApp();

    expect(
      await screen.findByText("How does the Node event loop work?"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("category-tab-nodejs")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(lastCall(questionCalls()).query.get("category")).toBe("nodejs");
  });

  it("shows the empty state for a category without questions", async () => {
    const { questionCalls } = mockApi({ questions: [] });
    renderApp();

    expect(await screen.findByTestId("questions-empty")).toHaveTextContent(
      "لا توجد نتائج",
    );
    expect(lastCall(questionCalls()).query.get("category")).toBe("laravel-core");
  });
});

describe("expanding a question", () => {
  it("hides answers until the question is expanded", async () => {
    const user = userEvent.setup();
    mockApi();
    renderApp();

    await screen.findByText("What is the service container?");
    expect(screen.queryByText("It resolves dependencies.")).not.toBeInTheDocument();

    await openQuestion(user, 1);
    expect(await screen.findByText("It resolves dependencies.")).toBeInTheDocument();
  });

  it("renders every answer attached to the question", async () => {
    const user = userEvent.setup();
    mockApi();
    renderApp();

    await openQuestion(user, 1);

    expect(await screen.findByText("It resolves dependencies.")).toBeInTheDocument();
    expect(screen.getByText("Bindings live in providers.")).toBeInTheDocument();
    const card = screen.getAllByTestId("question-card")[0];
    expect(within(card).getAllByTestId("question-answer")).toHaveLength(2);
  });

  it("collapses the answer again when pressed twice", async () => {
    const user = userEvent.setup();
    mockApi();
    renderApp();

    await openQuestion(user, 1);
    expect(await screen.findByText("It resolves dependencies.")).toBeInTheDocument();

    await user.click(screen.getByTestId("question-toggle-1"));
    await waitFor(() =>
      expect(screen.queryByText("It resolves dependencies.")).not.toBeInTheDocument(),
    );
  });
});

describe("question metadata", () => {
  it("renders a difficulty badge per question", async () => {
    mockApi();
    renderApp();

    const cards = await screen.findAllByTestId("question-card");
    expect(
      within(cards[0]).getByTestId("question-difficulty"),
    ).toHaveTextContent("مبتدئ");
    expect(
      within(cards[1]).getByTestId("question-difficulty"),
    ).toHaveTextContent("متوسط");
  });

  it("renders the tags of a question", async () => {
    mockApi();
    renderApp();

    const card = (await screen.findAllByTestId("question-card"))[0];
    expect(
      within(card)
        .getAllByTestId("question-tag")
        .map((tag) => tag.textContent),
    ).toEqual(["#container", "#di"]);
  });

  it("omits the tag row for a question without tags", async () => {
    mockApi({ questions: [untaggedQuestion] });
    renderApp();

    const card = await screen.findByTestId("question-card");
    expect(within(card).queryAllByTestId("question-tag")).toHaveLength(0);
    expect(within(card).getByTestId("question-difficulty")).toHaveTextContent(
      "متوسط",
    );
  });

  // Regression: the tag pill used to spread badgeStyle (which sets the `border`
  // shorthand) and then override only `borderStyle`, which React warns about.
  // It also read `theme.mutedText` and appended the alpha digits directly, so
  // the dark-mode `#666` produced `#66644` and the whole border declaration was
  // discarded. Asserting the serialised attribute covers both problems at once.
  it("gives tag pills a single valid dashed border", async () => {
    mockApi();
    renderApp();

    const card = (await screen.findAllByTestId("question-card"))[0];
    const style = within(card)
      .getAllByTestId("question-tag")[0]
      .getAttribute("style");

    const borders = (style ?? "").match(/border:[^;]*/g) ?? [];
    expect(borders).toHaveLength(1);
    // jsdom normalises an 8-digit hex colour to `rgba()`, so accept either form.
    expect(borders[0]).toMatch(
      /^border: 1px dashed (#[0-9a-f]{8}|rgba\(\d+, \d+, \d+, 0\.\d+\))$/i,
    );
    expect(style).not.toMatch(/border-style/);
  });
});

describe("search", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for typing to settle before requesting results", async () => {
    vi.useFakeTimers();
    const { searchCalls } = mockApi();
    renderApp();

    // Let the initial load settle without moving the debounce clock. Fake
    // timers rule out waitFor/userEvent here: they only advance jest's clock.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.queryByTestId("loading-screen")).not.toBeInTheDocument();

    const input = screen.getByPlaceholderText(/ابحث/);
    await act(async () => {
      fireEvent.change(input, { target: { value: "e" } });
      fireEvent.change(input, { target: { value: "ev" } });
      fireEvent.change(input, { target: { value: "event loop" } });
    });
    expect(searchCalls()).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS - 1);
    });
    expect(searchCalls()).toHaveLength(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    // The whole burst collapses into a single request for the final value.
    expect(searchCalls()).toHaveLength(1);
    expect(searchCalls()[0].query.get("q")).toBe("event loop");
    expect(screen.getByText("Explain the event loop.")).toBeInTheDocument();
    expect(screen.getByText("How does the Node event loop work?")).toBeInTheDocument();
    expect(screen.getByTestId("search-summary")).toHaveTextContent(
      "نتائج البحث: 2 سؤال",
    );
  });

  it("searches every category and reports the result count", async () => {
    const user = userEvent.setup();
    const { searchCalls } = mockApi();
    renderApp();

    await user.type(await screen.findByPlaceholderText(/ابحث/), "event loop");

    // "Explain the event loop." and "How does the Node event loop work?"
    await waitFor(() =>
      expect(screen.getByTestId("search-summary")).toHaveTextContent(
        "نتائج البحث: 2 سؤال",
      ),
    );
    expect(searchCalls().length).toBeGreaterThan(0);
    expect(lastCall(searchCalls()).query.get("q")).toBe("event loop");
    expect(screen.getByText("Explain the event loop.")).toBeInTheDocument();
    expect(
      screen.getByText("How does the Node event loop work?"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("What is the service container?"),
    ).not.toBeInTheDocument();
  });

  it("narrows results as the query gets more specific", async () => {
    const user = userEvent.setup();
    mockApi();
    renderApp();

    const input = await screen.findByPlaceholderText(/ابحث/);
    await user.type(input, "event loop");
    await waitFor(() =>
      expect(screen.getByTestId("search-summary")).toHaveTextContent(
        "نتائج البحث: 2 سؤال",
      ),
    );

    await user.clear(input);
    await user.type(input, "Explain");
    await waitFor(() =>
      expect(screen.getByTestId("search-summary")).toHaveTextContent(
        "نتائج البحث: 1 سؤال",
      ),
    );
    expect(
      screen.queryByText("How does the Node event loop work?"),
    ).not.toBeInTheDocument();
  });

  it("matches answer text as well as question text", async () => {
    const user = userEvent.setup();
    mockApi();
    renderApp();

    await user.type(await screen.findByPlaceholderText(/ابحث/), "Non-blocking");

    expect(
      await screen.findByText("How does the Node event loop work?"),
    ).toBeInTheDocument();
  });

  it("labels each hit with the category it came from", async () => {
    const user = userEvent.setup();
    mockApi();
    renderApp();

    await user.type(await screen.findByPlaceholderText(/ابحث/), "event loop");
    const hit = await screen.findByText("How does the Node event loop work?");

    const card = hit.closest("[data-testid='question-card']") as HTMLElement;
    expect(within(card).getByTestId("question-category")).toHaveTextContent(
      "Node.js",
    );
  });

  it("shows an empty state when nothing matches", async () => {
    const user = userEvent.setup();
    mockApi();
    renderApp();

    await user.type(await screen.findByPlaceholderText(/ابحث/), "zzzznotfound");

    await waitFor(() =>
      expect(screen.getByTestId("search-summary")).toHaveTextContent(
        "نتائج البحث: 0 سؤال",
      ),
    );
    expect(screen.getByTestId("questions-empty")).toHaveTextContent(
      "لا توجد نتائج",
    );
  });

  it("hides the category tabs while searching", async () => {
    const user = userEvent.setup();
    mockApi();
    renderApp();

    expect(await screen.findByTestId("category-tabs")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/ابحث/), "event");
    await waitFor(() =>
      expect(screen.queryByTestId("category-tabs")).not.toBeInTheDocument(),
    );
  });

  it("aborts a stale request and keeps the newest results", async () => {
    const user = userEvent.setup();
    const { held, searchCalls } = mockApi({
      hold: (path) => path === "/api/search",
    });
    renderApp();

    const input = await screen.findByPlaceholderText(/ابحث/);
    await user.type(input, "event loop");
    await waitFor(() => expect(held.length).toBeGreaterThan(0));
    const stale = searchCalls()[0];

    await user.clear(input);
    await user.type(input, "zzzznotfound");

    // Sending the newer query tears the in-flight one down.
    await waitFor(() => expect(stale.signal?.aborted).toBe(true));
    expect(searchCalls().length).toBeGreaterThan(1);

    await act(async () => {
      held[held.length - 1].resolve();
    });
    expect(screen.getByTestId("questions-empty")).toBeInTheDocument();

    // The abandoned response lands late and must not overwrite anything.
    await act(async () => {
      held[0].resolve();
    });
    expect(screen.getByTestId("questions-empty")).toBeInTheDocument();
    expect(screen.getByTestId("search-summary")).toHaveTextContent(
      "نتائج البحث: 0 سؤال",
    );
  });
});

describe("pagination", () => {
  /** Twelve Laravel questions so the first category needs two pages. */
  const paged = (extra: Question[] = []) =>
    mockApi({ questions: [...makeQuestions(12), ...extra], categories });

  it("requests the next page when the control is used", async () => {
    const user = userEvent.setup();
    const { questionCalls } = mockApi({ questions: makeQuestions(12) });
    renderApp();

    expect(await screen.findByText("سؤال رقم 1")).toBeInTheDocument();
    expect(screen.getByTestId("pagination-info")).toHaveTextContent(
      "صفحة 1 من 2",
    );
    expect(screen.getByTestId("pagination-total")).toHaveTextContent("12 سؤال");
    expect(screen.queryByText("سؤال رقم 11")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("pagination-next"));

    expect(await screen.findByText("سؤال رقم 11")).toBeInTheDocument();
    expect(screen.queryByText("سؤال رقم 1")).not.toBeInTheDocument();
    expect(screen.getByTestId("pagination-info")).toHaveTextContent(
      "صفحة 2 من 2",
    );
    expect(questionCalls()).toHaveLength(2);
    expect(lastCall(questionCalls()).query.get("page")).toBe("2");
  });

  it("disables the previous control on the first page", async () => {
    const user = userEvent.setup();
    mockApi({ questions: makeQuestions(12) });
    renderApp();

    await screen.findByText("سؤال رقم 1");
    expect(screen.getByTestId("pagination-prev")).toBeDisabled();
    expect(screen.getByTestId("pagination-next")).toBeEnabled();

    await user.click(screen.getByTestId("pagination-next"));

    await waitFor(() =>
      expect(screen.getByTestId("pagination-next")).toBeDisabled(),
    );
    expect(screen.getByTestId("pagination-prev")).toBeEnabled();
  });

  it("goes back to the previous page", async () => {
    const user = userEvent.setup();
    const { questionCalls } = mockApi({ questions: makeQuestions(12) });
    renderApp();

    await user.click(await screen.findByTestId("pagination-next"));
    await screen.findByText("سؤال رقم 11");

    await user.click(screen.getByTestId("pagination-prev"));
    expect(await screen.findByText("سؤال رقم 1")).toBeInTheDocument();
    expect(lastCall(questionCalls()).query.get("page")).toBe("1");
  });

  it("returns to the first page when another category is selected", async () => {
    const user = userEvent.setup();
    const { questionCalls } = paged(
      Array.from({ length: 12 }, (_, index) =>
        makeQuestion(100 + index, {
          category_id: "nodejs",
          category_label: "Node.js",
          question_text: `سؤال node ${index + 1}`,
        }),
      ),
    );
    renderApp();

    await user.click(await screen.findByTestId("pagination-next"));
    await screen.findByText("سؤال رقم 11");

    await user.click(screen.getByTestId("category-tab-nodejs"));

    expect(await screen.findByText("سؤال node 1")).toBeInTheDocument();
    expect(screen.getByTestId("pagination-info")).toHaveTextContent(
      "صفحة 1 من 2",
    );
    expect(lastCall(questionCalls()).query.get("page")).toBe("1");
    expect(lastCall(questionCalls()).query.get("category")).toBe("nodejs");
  });

  it("hides the controls when everything fits on one page", async () => {
    mockApi();
    renderApp();

    await screen.findByText("What is the service container?");
    expect(screen.queryByTestId("pagination")).not.toBeInTheDocument();
  });
});

describe("theme toggle", () => {
  it("switches between night and day mode", async () => {
    const user = userEvent.setup();
    mockApi();
    renderApp();

    await user.click(await screen.findByTestId("theme-toggle"));
    expect(screen.getByRole("button", { name: /وضع الليل/ })).toBeInTheDocument();
  });
});

describe("manage mode", () => {
  beforeEach(() => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("is hidden until manage mode is enabled", async () => {
    mockApi();
    renderApp();

    await screen.findByRole("button", { name: /وضع الإدارة/ });
    expect(screen.queryByTestId("new-category")).not.toBeInTheDocument();
  });

  it("reveals the create controls in manage mode", async () => {
    const user = userEvent.setup();
    mockApi();
    renderApp();

    await enterManageMode(user);
    expect(screen.getByTestId("new-category")).toHaveTextContent("+ تصنيف جديد");
    expect(screen.getByTestId("new-question")).toHaveTextContent("+ سؤال جديد");
  });

  it("creates a category through POST /api/categories", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi();
    renderApp();

    await enterManageMode(user);
    await user.click(screen.getByTestId("new-category"));

    const idInput = await screen.findByLabelText("المعرف (ID):");
    await user.type(idInput, "devops");
    await user.type(screen.getByLabelText("الاسم:"), "DevOps");
    await user.click(screen.getByTestId("form-save"));

    await waitFor(() => {
      const post = calls.find(
        (call) => call.method === "POST" && call.path === "/api/categories",
      );
      expect(post?.url).toBe("http://localhost:3000/api/categories");
      expect(post?.body).toMatchObject({ id: "devops", label: "DevOps" });
    });
    expect(await screen.findByTestId("category-tab-devops")).toBeInTheDocument();
  });

  it("edits an existing category through PUT /api/categories/:id", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi();
    renderApp();

    await enterManageMode(user);
    await user.click(screen.getByTestId("category-edit-laravel-core"));

    const labelInput = await screen.findByLabelText("الاسم:");
    await user.clear(labelInput);
    await user.type(labelInput, "Laravel Core Advanced");
    await user.click(screen.getByTestId("form-save"));

    await waitFor(() => {
      const put = calls.find(
        (call) =>
          call.method === "PUT" && call.path === "/api/categories/laravel-core",
      );
      expect(put?.url).toBe("http://localhost:3000/api/categories/laravel-core");
      expect(put?.body).toMatchObject({ label: "Laravel Core Advanced" });
    });
    expect(await screen.findByTestId("category-tab-laravel-core")).toHaveTextContent(
      "Laravel Core Advanced",
    );
  });

  it("reports a failed save instead of failing silently", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi({
      failures: [
        {
          method: "PUT",
          path: "/api/categories/laravel-core",
          status: 404,
          error: "Category not found",
        },
      ],
    });
    renderApp();

    await enterManageMode(user);
    await user.click(screen.getByTestId("category-edit-laravel-core"));
    await user.click(await screen.findByTestId("form-save"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Category not found");
    expect(screen.getByTestId("category-form")).toBeInTheDocument();
    expect(
      calls.some((call) => call.method === "PUT" && call.path === "/api/categories/laravel-core"),
    ).toBe(true);
  });

  it("warns that deleting a category also deletes its questions", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { calls } = mockApi();
    renderApp();

    await enterManageMode(user);
    await user.click(screen.getByTestId("category-delete-laravel-core"));

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining("permanently deleted"),
    );
    await waitFor(() => {
      const del = calls.find(
        (call) =>
          call.method === "DELETE" && call.path === "/api/categories/laravel-core",
      );
      expect(del?.url).toBe("http://localhost:3000/api/categories/laravel-core");
    });
    await waitFor(() =>
      expect(
        screen.queryByTestId("category-tab-laravel-core"),
      ).not.toBeInTheDocument(),
    );
  });

  it("creates a question with its difficulty and tags", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi();
    renderApp();

    await enterManageMode(user);
    await user.click(screen.getByTestId("new-question"));

    await user.type(await screen.findByLabelText("السؤال:"), "What is a facade?");
    await user.selectOptions(screen.getByLabelText("المستوى:"), "advanced");
    await user.type(screen.getByLabelText("الوسوم:"), "laravel, facades");
    await user.type(screen.getByLabelText("الإجابة 1"), "A fluent proxy.");
    await user.click(screen.getByTestId("form-save"));

    await waitFor(() => {
      const post = calls.find(
        (call) => call.method === "POST" && call.path === "/api/questions",
      );
      expect(post?.body).toMatchObject({
        question_text: "What is a facade?",
        category_id: "laravel-core",
        difficulty: "advanced",
        tags: ["laravel", "facades"],
        answers: [{ answer_text: "A fluent proxy." }],
      });
    });
    expect(await screen.findByText("What is a facade?")).toBeInTheDocument();
  });

  it("edits a question through PUT /api/questions/:id", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi();
    renderApp();

    await enterManageMode(user);
    await user.click(screen.getByTestId("question-edit-1"));

    const text = await screen.findByLabelText("السؤال:");
    await user.clear(text);
    await user.type(text, "What is the service container, exactly?");
    await user.click(screen.getByTestId("form-save"));

    await waitFor(() => {
      const put = calls.find(
        (call) => call.method === "PUT" && call.path === "/api/questions/1",
      );
      expect(put?.body).toMatchObject({
        question_text: "What is the service container, exactly?",
        difficulty: "beginner",
        tags: ["container", "di"],
        answers: [
          { answer_text: "It resolves dependencies." },
          { answer_text: "Bindings live in providers." },
        ],
      });
    });
  });

  it("deletes a question after confirming", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { calls } = mockApi();
    renderApp();

    await enterManageMode(user);
    await user.click(screen.getByTestId("question-delete-1"));

    expect(confirmSpy).toHaveBeenCalledWith(
      "Delete this question and its answers?",
    );
    await waitFor(() => {
      const del = calls.find(
        (call) =>
          call.method === "DELETE" && call.path === "/api/questions/1",
      );
      expect(del?.url).toBe("http://localhost:3000/api/questions/1");
    });
    await waitFor(() =>
      expect(
        screen.queryByText("What is the service container?"),
      ).not.toBeInTheDocument(),
    );
  });

  it("hides the search box while in manage mode", async () => {
    const user = userEvent.setup();
    mockApi();
    renderApp();

    expect(await screen.findByPlaceholderText(/ابحث/)).toBeInTheDocument();
    await enterManageMode(user);
    expect(screen.queryByPlaceholderText(/ابحث/)).not.toBeInTheDocument();
  });
});
