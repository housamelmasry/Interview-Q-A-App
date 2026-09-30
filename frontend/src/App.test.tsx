import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { categories, mockApi, mockApiFailure, questions } from "./test/fixtures";

const renderApp = () => render(<App />);

/** The result count is split across text nodes, so assert on the wrapper. */
const expectResultCount = (n: number) =>
  expect(screen.getByText(/نتائج البحث/)).toHaveTextContent(
    `نتائج البحث: ${n} سؤال`,
  );

describe("initial load", () => {
  it("shows a loading state before data arrives", async () => {
    mockApi();
    renderApp();
    expect(screen.getByText("جاري التحميل...")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("جاري التحميل...")).not.toBeInTheDocument(),
    );
  });

  it("fetches categories and questions from the API", async () => {
    const { calls } = mockApi();
    renderApp();
    await waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(2));
    expect(calls[0].url).toBe("http://localhost:3000/api/categories");
    expect(calls[1].url).toBe("http://localhost:3000/api/questions");
  });

  it("renders the total question count from the API", async () => {
    mockApi();
    renderApp();
    await waitFor(() => expect(screen.getByText(/سؤال وإجابة موثّقة/)).toBeInTheDocument());
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
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
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
  it("renders a tab per category with its question count", async () => {
    mockApi();
    renderApp();

    const tab = await screen.findByRole("button", { name: /Laravel Core/ });
    expect(tab).toHaveTextContent("(2)");

    const nodeTab = screen.getByRole("button", { name: /Node\.js/ });
    expect(nodeTab).toHaveTextContent("(1)");
  });

  it("only lists questions from the active category", async () => {
    mockApi();
    renderApp();

    expect(
      await screen.findByText("What is the service container?"),
    ).toBeInTheDocument();
    expect(screen.queryByText("How does the Node event loop work?")).not.toBeInTheDocument();
  });

  it("switches the visible questions when another tab is selected", async () => {
    const user = userEvent.setup();
    mockApi();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /Node\.js/ }));
    expect(
      await screen.findByText("How does the Node event loop work?"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("What is the service container?"),
    ).not.toBeInTheDocument();
  });

  it("falls back to the first category when the default one no longer exists", async () => {
    mockApi({ questions: [] });
    renderApp();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Laravel Core/ })).toBeInTheDocument(),
    );
    expect(screen.getByText("لا توجد نتائج")).toBeInTheDocument();
  });
});

describe("expanding a question", () => {
  it("hides answers until the question is expanded", async () => {
    const user = userEvent.setup();
    mockApi();
    renderApp();

    const question = await screen.findByText("What is the service container?");
    expect(screen.queryByText("It resolves dependencies.")).not.toBeInTheDocument();

    await user.click(question);
    expect(await screen.findByText("It resolves dependencies.")).toBeInTheDocument();
  });

  it("renders every answer attached to the question", async () => {
    const user = userEvent.setup();
    mockApi();
    renderApp();

    await user.click(await screen.findByText("What is the service container?"));
    expect(await screen.findByText("It resolves dependencies.")).toBeInTheDocument();
    expect(screen.getByText("Bindings live in providers.")).toBeInTheDocument();
  });

  it("collapses the answer again when pressed twice", async () => {
    const user = userEvent.setup();
    mockApi();
    renderApp();

    const question = await screen.findByText("What is the service container?");
    await user.click(question);
    expect(await screen.findByText("It resolves dependencies.")).toBeInTheDocument();

    await user.click(question);
    await waitFor(() =>
      expect(screen.queryByText("It resolves dependencies.")).not.toBeInTheDocument(),
    );
  });
});

describe("search", () => {
  it("filters on question text and reports the result count", async () => {
    const user = userEvent.setup();
    mockApi();
    renderApp();

    await user.type(await screen.findByPlaceholderText(/ابحث/), "event loop");

    // "Explain the event loop." and "How does the Node event loop work?"
    await waitFor(() => expectResultCount(2));
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
    await waitFor(() => expectResultCount(2));

    await user.clear(input);
    await user.type(input, "Explain");
    await waitFor(() => expectResultCount(1));
    expect(
      screen.queryByText("How does the Node event loop work?"),
    ).not.toBeInTheDocument();
  });

  it("matches answer text as well as question text", async () => {
    const user = userEvent.setup();
    mockApi();
    renderApp();

    await user.type(await screen.findByPlaceholderText(/ابحث/), "Non-blocking");

    await waitFor(() =>
      expect(screen.getByText("How does the Node event loop work?")).toBeInTheDocument(),
    );
  });

  it("searches across all categories and labels each hit with its category", async () => {
    const user = userEvent.setup();
    mockApi();
    renderApp();

    await user.type(await screen.findByPlaceholderText(/ابحث/), "event loop");
    await waitFor(() => expect(screen.getByText(/نتائج البحث/)).toBeInTheDocument());

    const hit = screen.getByText("How does the Node event loop work?");
    const card = hit.closest("div")!.parentElement!;
    expect(within(card).getByText("Node.js")).toBeInTheDocument();
  });

  it("shows an empty state when nothing matches", async () => {
    const user = userEvent.setup();
    mockApi();
    renderApp();

    await user.type(await screen.findByPlaceholderText(/ابحث/), "zzzznotfound");

    await waitFor(() => expectResultCount(0));
    expect(screen.getByText("لا توجد نتائج")).toBeInTheDocument();
  });

  it("hides the category tabs while searching", async () => {
    const user = userEvent.setup();
    mockApi();
    renderApp();

    // Tabs render a "(n)" question counter; result cards do not, so this
    // selector cannot collide with the per-result category badge.
    expect(
      await screen.findByRole("button", { name: /Laravel Core \(2\)/ }),
    ).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/ابحث/), "event");
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: /Laravel Core \(2\)/ }),
      ).not.toBeInTheDocument(),
    );
  });
});

describe("theme toggle", () => {
  it("switches between night and day mode", async () => {
    const user = userEvent.setup();
    mockApi();
    renderApp();

    const toggle = await screen.findByRole("button", { name: /وضع النهار/ });
    await user.click(toggle);
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
    expect(screen.queryByRole("button", { name: "+ تصنيف جديد" })).not.toBeInTheDocument();
  });

  it("reveals the create controls in manage mode", async () => {
    const user = userEvent.setup();
    mockApi();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /وضع الإدارة/ }));
    expect(screen.getByRole("button", { name: "+ تصنيف جديد" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ سؤال جديد" })).toBeInTheDocument();
  });

  it("creates a category through POST /api/categories", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /وضع الإدارة/ }));
    await user.click(screen.getByRole("button", { name: "+ تصنيف جديد" }));

    const idInput = screen.getByLabelText(/المعرف/);
    await user.clear(idInput);
    await user.type(idInput, "devops");
    await user.type(screen.getByLabelText(/الاسم/), "DevOps");
    await user.click(screen.getByRole("button", { name: "حفظ" }));

    await waitFor(() => {
      const post = calls.find((c) => c.init?.method === "POST");
      expect(post?.url).toBe("http://localhost:3000/api/categories");
      expect(JSON.parse(String(post?.init?.body))).toMatchObject({
        id: "devops",
        label: "DevOps",
      });
    });
  });

  it("edits an existing category through PUT /api/categories/:id", async () => {
    const user = userEvent.setup();
    const { calls } = mockApi();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /وضع الإدارة/ }));
    await user.click(screen.getAllByRole("button", { name: "✏️" })[0]);

    const labelInput = await screen.findByLabelText(/الاسم/);
    await user.clear(labelInput);
    await user.type(labelInput, "Laravel Core Advanced");
    await user.click(screen.getByRole("button", { name: "حفظ" }));

    await waitFor(() => {
      const put = calls.find((c) => c.init?.method === "PUT");
      expect(put?.url).toBe("http://localhost:3000/api/categories/laravel-core");
      expect(JSON.parse(String(put?.init?.body))).toMatchObject({
        label: "Laravel Core Advanced",
      });
    });
  });

  it("reports a failed save instead of failing silently", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { fetchMock } = mockApi();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PUT") {
        return { ok: false, status: 404, json: async () => ({ error: "Category not found" }) };
      }
      if (url.endsWith("/api/categories")) {
        return { ok: true, status: 200, json: async () => categories };
      }
      return { ok: true, status: 200, json: async () => questions };
    });

    renderApp();
    await user.click(await screen.findByRole("button", { name: /وضع الإدارة/ }));
    await user.click(screen.getAllByRole("button", { name: "✏️" })[0]);
    await user.click(await screen.findByRole("button", { name: "حفظ" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Category not found");
  });

  it("warns that deleting a category also deletes its questions", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { calls } = mockApi();
    renderApp();

    await user.click(await screen.findByRole("button", { name: /وضع الإدارة/ }));
    await user.click(screen.getAllByRole("button", { name: "🗑️" })[0]);

    expect(confirmSpy).toHaveBeenCalledWith(
      expect.stringContaining("permanently deleted"),
    );
    await waitFor(() => {
      const del = calls.find((c) => c.init?.method === "DELETE");
      expect(del?.url).toBe("http://localhost:3000/api/categories/laravel-core");
    });
  });

  it("hides the search box while in manage mode", async () => {
    const user = userEvent.setup();
    mockApi();
    renderApp();

    expect(await screen.findByPlaceholderText(/ابحث/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /وضع الإدارة/ }));
    expect(screen.queryByPlaceholderText(/ابحث/)).not.toBeInTheDocument();
  });
});
