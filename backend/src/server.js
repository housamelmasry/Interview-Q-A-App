import cors from "cors";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import swaggerUi from "swagger-ui-express";

import { ready } from "./database.js";
import { messageForError, statusForError } from "./errors.js";
import * as repo from "./repository.js";
import {
  normaliseAnswers,
  normaliseDifficulty,
  normaliseTags,
  parseDifficultyFilter,
} from "./validate.js";

const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Interactive API documentation (OpenAPI 3 spec -> Swagger UI)
// ---------------------------------------------------------------------------

const openapiSpec = JSON.parse(
  fs.readFileSync(path.join(__dirname, "openapi.json"), "utf8"),
);
app.get("/api/openapi.json", (_req, res) => res.json(openapiSpec));
app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapiSpec, { explorer: true }));

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Reads and validates `page` and `limit`, which are 1-based and clamped.
 *
 * Out-of-range or unparseable values fall back to defaults rather than erroring,
 * so a malformed link still renders something useful instead of an error page.
 */
function parsePagination(query) {
  const rawLimit = Number.parseInt(query.limit, 10);
  const rawPage = Number.parseInt(query.page, 10);

  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  return { limit, page };
}

/** Wraps a page of items in the shape the client paginates against. */
function envelope(items, total, { limit, page }) {
  return {
    items,
    total,
    page,
    limit,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json({ status: "OK" });
});

/** Aggregate counts used for the header summary and category tab badges. */
app.get("/api/stats", async (_req, res) => {
  res.json(await repo.getStats());
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

app.get("/api/categories", async (_req, res) => {
  res.json(await repo.listCategories());
});

app.post("/api/categories", async (req, res) => {
  const { id, label, icon, color } = req.body;

  if (!id || !label) {
    return res
      .status(400)
      .json({ error: "Category ID and label are required" });
  }

  await repo.createCategory({ id, label, icon, color });
  res.status(201).json({ id, message: "Category added successfully" });
});

app.put("/api/categories/:id", async (req, res) => {
  const { id } = req.params;
  const { label, icon, color } = req.body;

  if (!label) {
    return res.status(400).json({ error: "Category label is required" });
  }

  const { changes } = await repo.updateCategory(id, { label, icon, color });
  if (changes === 0) {
    return res.status(404).json({ error: "Category not found" });
  }

  res.json({ message: "Category updated successfully" });
});

app.delete("/api/categories/:id", async (req, res) => {
  const { changes } = await repo.deleteCategory(req.params.id);
  if (changes === 0) {
    return res.status(404).json({ error: "Category not found" });
  }

  res.json({ message: "Category deleted successfully" });
});

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

/**
 * Validates and normalises the shared create/post question payload.
 *
 * Only `category_id` and `question_text` are required. The rest default sensibly
 * for a create: no difficulty means `intermediate`, no tags means none, no
 * answers means none.
 */
function readCreateInput(body) {
  const { category_id, question_text, answers, difficulty, tags } = body;

  if (!category_id || !question_text) {
    return { error: "Category ID and question text are required" };
  }

  return {
    value: {
      category_id,
      question_text: question_text.trim(),
      difficulty: normaliseDifficulty(difficulty),
      tags: JSON.stringify(normaliseTags(tags)),
      answers: normaliseAnswers(answers),
    },
  };
}

/**
 * Validates and normalises an update payload.
 *
 * Unlike create, an absent key means "leave this field as it is", so a caller can
 * patch one field without clobbering the others. That is why every optional value
 * is `undefined` rather than defaulted: the repository builds its `SET` clause
 * from the keys that are actually present.
 */
function readUpdateInput(body) {
  const { category_id, question_text, answers, difficulty, tags } = body;

  if (!category_id || !question_text) {
    return { error: "Category ID and question text are required" };
  }

  return {
    value: {
      category_id,
      question_text: question_text.trim(),
      difficulty: Object.hasOwn(body, "difficulty")
        ? normaliseDifficulty(difficulty)
        : undefined,
      tags: Object.hasOwn(body, "tags")
        ? JSON.stringify(normaliseTags(tags))
        : undefined,
      // An explicit empty array is a deliberate instruction to remove them all.
      answers: Object.hasOwn(body, "answers") ? normaliseAnswers(answers) : null,
    },
  };
}

app.get("/api/questions", async (req, res) => {
  const pagination = parsePagination(req.query);
  const difficulty = parseDifficultyFilter(req.query.difficulty);

  const { items, total } = await repo.listQuestions({
    category: req.query.category,
    difficulty,
    limit: pagination.limit,
    offset: (pagination.page - 1) * pagination.limit,
  });

  res.json(envelope(items, total, pagination));
});

app.get("/api/search", async (req, res) => {
  const { q } = req.query;
  const pagination = parsePagination(req.query);
  const difficulty = parseDifficultyFilter(req.query.difficulty);

  if (!q || !String(q).trim()) {
    return res.json(envelope([], 0, pagination));
  }

  const { items, total } = await repo.searchAllQuestions({
    term: q,
    difficulty,
    limit: pagination.limit,
    offset: (pagination.page - 1) * pagination.limit,
  });

  res.json(envelope(items, total, pagination));
});

app.post("/api/questions", async (req, res) => {
  const { value, error } = readCreateInput(req.body);
  if (error) return res.status(400).json({ error });

  const id = await repo.createQuestion(value);

  res.status(201).json({
    id,
    message:
      value.answers.length > 0
        ? "Question and answers added successfully"
        : "Question added successfully",
  });
});

app.put("/api/questions/:id", async (req, res) => {
  const { value, error } = readUpdateInput(req.body);
  if (error) return res.status(400).json({ error });

  const answersProvided = value.answers !== null;
  const found = await repo.updateQuestion({ ...value, id: req.params.id });
  if (!found) {
    return res.status(404).json({ error: "Question not found" });
  }

  res.json({
    message: answersProvided
      ? "Question and answers updated successfully"
      : "Question updated successfully",
  });
});

app.delete("/api/questions/:id", async (req, res) => {
  const { changes } = await repo.deleteQuestion(req.params.id);
  if (changes === 0) {
    return res.status(404).json({ error: "Question not found" });
  }

  res.json({ message: "Question deleted successfully" });
});

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

app.get("/api/answers/:questionId", async (req, res) => {
  res.json(await repo.listAnswers(req.params.questionId));
});

app.put("/api/answers/:id", async (req, res) => {
  const { answer_text } = req.body;

  if (!answer_text) {
    return res.status(400).json({ error: "Answer text is required" });
  }

  const { changes } = await repo.updateAnswer(req.params.id, answer_text);
  if (changes === 0) {
    return res.status(404).json({ error: "Answer not found" });
  }

  res.json({ message: "Answer updated successfully" });
});

app.delete("/api/answers/:id", async (req, res) => {
  const { changes } = await repo.deleteAnswer(req.params.id);
  if (changes === 0) {
    return res.status(404).json({ error: "Answer not found" });
  }

  res.json({ message: "Answer deleted successfully" });
});

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

/**
 * Terminal error handler, mounted after every route.
 *
 * Handlers are `async`, and Express 5 forwards a rejected promise to here on its
 * own, so no route needs its own try/catch. Keeping the catch in one place is
 * what guarantees a database failure can never leave a response hanging.
 *
 * The status and message come from `errors.js` rather than defaulting everything
 * to 500, so a duplicate id or a bad foreign key is reported as the client error
 * it is instead of asking the user to retry something that cannot succeed.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity
app.use((err, _req, res, _next) => {
  const status = statusForError(err);
  if (status >= 500) console.error("Unhandled request error:", err);

  res.status(status).json({ error: messageForError(err, status) });
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

// Only bind a port when this file is executed directly. The test suite imports
// `app` and drives it in-process, so it must not start a listener.
const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const port = Number(process.env.PORT) || 3000;
  // Never accept requests before migrations and the schema are ready.
  await ready;
  app.listen(port, () => {
    console.log(`Backend running on port ${port}`);
    console.log(`API docs available at http://localhost:${port}/api/docs`);
  });
}

export default app;
