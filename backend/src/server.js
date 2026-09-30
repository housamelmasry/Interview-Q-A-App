import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import swaggerUi from "swagger-ui-express";
import db, { ready } from "./database.js";
import { searchQuestions, groupRows, safeParseTags } from "./search.js";

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Interactive API documentation (OpenAPI 3 spec -> Swagger UI)
const openapiSpec = JSON.parse(
  fs.readFileSync(path.join(__dirname, "openapi.json"), "utf8"),
);
app.get("/api/openapi.json", (_req, res) => res.json(openapiSpec));
app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(openapiSpec, { explorer: true }),
);

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ changes: this.changes, lastID: this.lastID });
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Reads and validates `page` and `limit` query parameters. `page` is 1-based.
 * Invalid or out-of-range values fall back to defaults rather than erroring, so
 * a malformed link still renders something useful.
 */
function parsePagination(query) {
  const rawLimit = Number.parseInt(query.limit, 10);
  const rawPage = Number.parseInt(query.page, 10);

  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;

  return { limit, page, offset: (page - 1) * limit };
}

function buildEnvelope(items, total, { limit, page }) {
  return {
    items,
    total,
    page,
    limit,
    pages: limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1,
  };
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

app.get("/api/health", (_req, res) => {
  res.json({ status: "OK" });
});

/** Aggregate counts used for the header summary and per-category tab badges. */
app.get("/api/stats", async (_req, res) => {
  try {
    const [totals, perCategory] = await Promise.all([
      get(`SELECT
             (SELECT COUNT(*) FROM categories) AS total_categories,
             (SELECT COUNT(*) FROM questions)  AS total_questions,
             (SELECT COUNT(*) FROM answers)    AS total_answers`),
      all(`SELECT c.id, c.label, c.icon, c.color, COUNT(q.id) AS question_count
              FROM categories c
              LEFT JOIN questions q ON q.category_id = c.id
             GROUP BY c.id
             ORDER BY c.label`),
    ]);

    res.json({ ...totals, categories: perCategory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

app.get("/api/categories", async (_req, res) => {
  try {
    const rows = await all(`
      SELECT c.id, c.label, c.icon, c.color, COUNT(q.id) AS question_count
        FROM categories c
        LEFT JOIN questions q ON q.category_id = c.id
       GROUP BY c.id
       ORDER BY c.label
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/categories", async (req, res) => {
  const { id, label, icon, color } = req.body;

  if (!id || !label) {
    return res
      .status(400)
      .json({ error: "Category ID and label are required" });
  }

  try {
    await run(
      "INSERT INTO categories (id, label, icon, color) VALUES (?, ?, ?, ?)",
      [id, label, icon || "", color || "#666666"],
    );
    res.status(201).json({ id, message: "Category added successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/categories/:id", async (req, res) => {
  const { id } = req.params;
  const { label, icon, color } = req.body;

  if (!label) {
    return res.status(400).json({ error: "Category label is required" });
  }

  try {
    const result = await run(
      "UPDATE categories SET label = ?, icon = ?, color = ? WHERE id = ?",
      [label, icon || "", color || "#666666", id],
    );
    if (result.changes === 0) {
      return res.status(404).json({ error: "Category not found" });
    }
    res.json({ message: "Category updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/categories/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await run("DELETE FROM categories WHERE id = ?", [id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Category not found" });
    }
    res.json({ message: "Category deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

/**
 * Lists questions with their answers, optionally filtered by category and
 * paginated. Responds with a `{ items, total, page, limit, pages }` envelope so
 * the client can render pagination controls without a second request.
 */
app.get("/api/questions", async (req, res) => {
  const { category } = req.query;
  const pagination = parsePagination(req.query);

  const where = category ? "WHERE q.category_id = ?" : "";
  const params = category ? [category] : [];

  try {
    const countRow = await get(
      `SELECT COUNT(*) AS count FROM questions q ${where}`,
      params,
    );

    if (countRow.count === 0) {
      return res.json(buildEnvelope([], 0, pagination));
    }

    // Paginate on questions first, then attach their answers. Applying LIMIT to
    // the joined rows directly would let a question's answer count eat into the
    // page size, so a page of 20 could return as few as 7 questions.
    const idRows = await all(
      `SELECT q.id FROM questions q ${where} ORDER BY q.id LIMIT ? OFFSET ?`,
      [...params, pagination.limit, pagination.offset],
    );

    if (idRows.length === 0) {
      return res.json(buildEnvelope([], countRow.count, pagination));
    }

    const ids = idRows.map((r) => r.id);
    const rows = await all(
      `SELECT q.id, q.question_text, q.category_id, q.difficulty, q.tags,
              c.label AS category_label, c.icon, c.color,
              a.id AS answer_id, a.answer_text
         FROM questions q
         JOIN categories c ON c.id = q.category_id
         LEFT JOIN answers a ON a.question_id = q.id
        WHERE q.id IN (${ids.map(() => "?").join(",")})
        ORDER BY q.id, a.id`,
      ids,
    );

    res.json(buildEnvelope(groupRows(rows), countRow.count, pagination));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Full-text search across question and answer text, paginated. */
app.get("/api/search", async (req, res) => {
  const { q } = req.query;
  const pagination = parsePagination(req.query);

  if (!q || !String(q).trim()) {
    return res.json(buildEnvelope([], 0, pagination));
  }

  try {
    const { items, total } = await searchQuestions(db, q, {
      limit: pagination.limit,
      offset: pagination.offset,
    });
    res.json(buildEnvelope(items, total, pagination));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/questions", async (req, res) => {
  const { category_id, question_text, answers, difficulty, tags } = req.body;

  if (!category_id || !question_text) {
    return res
      .status(400)
      .json({ error: "Category ID and question text are required" });
  }

  const answerList = Array.isArray(answers) ? answers : [];
  const difficultyValue = difficulty || "intermediate";
  const tagsValue = Array.isArray(tags) ? JSON.stringify(tags) : "[]";

  try {
    // The question and its answers must land together, so the whole insert is
    // wrapped in a transaction: a failure on the last answer cannot leave an
    // orphaned question behind.
    await run("BEGIN");
    try {
      const result = await run(
        `INSERT INTO questions (category_id, question_text, difficulty, tags)
         VALUES (?, ?, ?, ?)`,
        [category_id, question_text, difficultyValue, tagsValue],
      );
      const questionId = result.lastID;

      let inserted = 0;
      for (const answer of answerList) {
        const text =
          typeof answer === "string" ? answer : answer?.answer_text;
        if (typeof text === "string" && text.trim()) {
          await run(
            "INSERT INTO answers (question_id, answer_text) VALUES (?, ?)",
            [questionId, text],
          );
          inserted += 1;
        }
      }

      await run("COMMIT");
      res.status(201).json({
        id: questionId,
        message:
          inserted > 0
            ? "Question and answers added successfully"
            : "Question added successfully",
      });
    } catch (innerError) {
      await run("ROLLBACK");
      throw innerError;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Updates a question. When `answers` is supplied it is treated as the complete
 * desired answer set: the previous rows are deleted and the new ones inserted.
 * All of it happens in one transaction, so a failure part-way through can never
 * leave a question with a half-replaced answer set.
 */
app.put("/api/questions/:id", async (req, res) => {
  const { id } = req.params;
  const { question_text, category_id, answers, difficulty, tags } = req.body;

  if (!question_text || !category_id) {
    return res
      .status(400)
      .json({ error: "Category ID and question text are required" });
  }

  const difficultyValue = difficulty || "intermediate";
  const tagsValue = Array.isArray(tags) ? JSON.stringify(tags) : "[]";
  const hasAnswers = Array.isArray(answers);

  try {
    await run("BEGIN");
    try {
      const updated = await run(
        `UPDATE questions
            SET question_text = ?, category_id = ?, difficulty = ?, tags = ?
          WHERE id = ?`,
        [question_text, category_id, difficultyValue, tagsValue, id],
      );

      if (updated.changes === 0) {
        await run("ROLLBACK");
        return res.status(404).json({ error: "Question not found" });
      }

      if (hasAnswers) {
        await run("DELETE FROM answers WHERE question_id = ?", [id]);
        for (const answer of answers) {
          const text =
            typeof answer === "string" ? answer : answer?.answer_text;
          if (text) {
            await run(
              "INSERT INTO answers (question_id, answer_text) VALUES (?, ?)",
              [id, text],
            );
          }
        }
      }

      await run("COMMIT");
      res.json({
        message: hasAnswers
          ? "Question and answers updated successfully"
          : "Question updated successfully",
      });
    } catch (innerError) {
      await run("ROLLBACK");
      throw innerError;
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/questions/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await run("DELETE FROM questions WHERE id = ?", [id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Question not found" });
    }
    res.json({ message: "Question deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

app.get("/api/answers/:questionId", async (req, res) => {
  const { questionId } = req.params;
  try {
    const rows = await all(
      "SELECT * FROM answers WHERE question_id = ? ORDER BY id",
      [questionId],
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/answers/:id", async (req, res) => {
  const { id } = req.params;
  const { answer_text } = req.body;

  if (!answer_text) {
    return res.status(400).json({ error: "Answer text is required" });
  }

  try {
    const result = await run(
      "UPDATE answers SET answer_text = ? WHERE id = ?",
      [answer_text, id],
    );
    if (result.changes === 0) {
      return res.status(404).json({ error: "Answer not found" });
    }
    res.json({ message: "Answer updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/answers/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await run("DELETE FROM answers WHERE id = ?", [id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: "Answer not found" });
    }
    res.json({ message: "Answer deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
