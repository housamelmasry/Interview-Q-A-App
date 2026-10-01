/**
 * Data access for the three tables.
 *
 * Route handlers call these instead of writing SQL inline. That keeps the SQL in
 * one place per operation, so a schema change is a single-file edit, and it lets
 * the route layer stay about HTTP: validating input, choosing a status code,
 * shaping the response.
 *
 * Every statement is parameterised. The only interpolation anywhere is the
 * generated placeholder list in `listQuestions`, whose length comes from the
 * number of ids already bound as parameters.
 */
import db from "./database.js";
import { groupRows, searchQuestions } from "./search.js";

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

/**
 * Runs `work` inside a transaction, committing on success and rolling back on
 * any failure.
 *
 * The inner `try`/`catch` rethrows after rolling back, so callers only ever see
 * the original error and never a half-applied write.
 */
async function transaction(work) {
  await run("BEGIN");
  try {
    const result = await work();
    await run("COMMIT");
    return result;
  } catch (err) {
    await run("ROLLBACK");
    throw err;
  }
}

/** Columns every question response needs, joined to its category. */
const QUESTION_COLUMNS = `
  q.id, q.question_text, q.category_id, q.difficulty, q.tags,
  c.label AS category_label, c.icon, c.color,
  a.id AS answer_id, a.answer_text
`;

const QUESTION_JOINS = `
  FROM questions q
  JOIN categories c ON c.id = q.category_id
  LEFT JOIN answers a ON a.question_id = q.id
`;

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export const listCategories = () =>
  all(`
    SELECT c.id, c.label, c.icon, c.color, COUNT(q.id) AS question_count
      FROM categories c
      LEFT JOIN questions q ON q.category_id = c.id
     GROUP BY c.id
     ORDER BY c.label
  `);

export const createCategory = ({ id, label, icon, color }) =>
  run(
    "INSERT INTO categories (id, label, icon, color) VALUES (?, ?, ?, ?)",
    [id, label, icon ?? "", color ?? "#666666"],
  );

export const updateCategory = (id, { label, icon, color }) =>
  run("UPDATE categories SET label = ?, icon = ?, color = ? WHERE id = ?", [
    label,
    icon ?? "",
    color ?? "#666666",
    id,
  ]);

export const deleteCategory = (id) =>
  run("DELETE FROM categories WHERE id = ?", [id]);

/** Aggregate counts for the header summary. */
export const getStats = async () => {
  const [totals, perCategory] = await Promise.all([
    get(`SELECT
           (SELECT COUNT(*) FROM categories) AS total_categories,
           (SELECT COUNT(*) FROM questions)  AS total_questions,
           (SELECT COUNT(*) FROM answers)    AS total_answers`),
    listCategories(),
  ]);

  return { ...totals, categories: perCategory };
};

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

/**
 * Returns one page of questions, optionally narrowed to a category, alongside
 * the total matching that filter.
 *
 * Paging happens on question ids and the answers are attached afterwards.
 * Applying `LIMIT` to the joined rows directly would let a question's answer
 * count consume the page budget, so a page of 20 could return as few as 7
 * questions.
 */
export const listQuestions = async ({ category, limit, offset }) => {
  const where = category ? "WHERE q.category_id = ?" : "";
  const params = category ? [category] : [];

  const { count: total } = await get(
    `SELECT COUNT(*) AS count FROM questions q ${where}`,
    params,
  );
  if (total === 0) return { items: [], total };

  const idRows = await all(
    `SELECT q.id FROM questions q ${where} ORDER BY q.id LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );
  if (idRows.length === 0) return { items: [], total };

  const ids = idRows.map((row) => row.id);
  const rows = await all(
    `SELECT ${QUESTION_COLUMNS} ${QUESTION_JOINS}
      WHERE q.id IN (${ids.map(() => "?").join(",")})
      ORDER BY q.id, a.id`,
    ids,
  );

  return { items: groupRows(rows), total };
};

/** Full-text search across question and answer text. */
export const searchAllQuestions = ({ term, limit, offset }) =>
  searchQuestions(db, term, { limit, offset });

/**
 * Inserts a question and its answers atomically, so a failure on any answer
 * cannot leave an orphaned question behind.
 */
export const createQuestion = ({
  category_id,
  question_text,
  difficulty,
  tags,
  answers = [],
}) =>
  transaction(async () => {
    const result = await run(
      `INSERT INTO questions (category_id, question_text, difficulty, tags)
       VALUES (?, ?, ?, ?)`,
      [category_id, question_text, difficulty, tags],
    );

    for (const text of answers) {
      await run("INSERT INTO answers (question_id, answer_text) VALUES (?, ?)", [
        result.lastID,
        text,
      ]);
    }

    return result.lastID;
  });

/**
 * Updates a question and, when a new answer set is supplied, its answers.
 *
 * Optional fields are `undefined` when the caller omitted the key, which means
 * "leave this alone", and are otherwise the new value. That distinction is what
 * makes `PUT` safe to call partially: sending only `{ question_text }` must not
 * silently blank the tags or reset the difficulty. An empty array for `answers`
 * is still meaningful, and means "remove them all".
 *
 * The whole thing is one transaction, so a failure part-way through cannot leave
 * a half-replaced answer set.
 */
export const updateQuestion = ({
  id,
  category_id,
  question_text,
  difficulty,
  tags,
  answers,
}) =>
  transaction(async () => {
    // Build the SET clause from the fields actually supplied. `id` is bound
    // separately below, so the placeholder order stays assignment order.
    const assignments = [];
    const values = [];
    for (const [column, value] of [
      ["question_text", question_text],
      ["category_id", category_id],
      ["difficulty", difficulty],
      ["tags", tags],
    ]) {
      if (value === undefined) continue;
      assignments.push(`${column} = ?`);
      values.push(value);
    }

    if (assignments.length === 0) {
      // Nothing to change, but the row may still not exist.
      const existing = await get("SELECT 1 FROM questions WHERE id = ?", [id]);
      return existing !== undefined;
    }

    const updated = await run(
      `UPDATE questions SET ${assignments.join(", ")} WHERE id = ?`,
      [...values, id],
    );
    if (updated.changes === 0) return false;

    if (answers) {
      await run("DELETE FROM answers WHERE question_id = ?", [id]);
      for (const text of answers) {
        await run(
          "INSERT INTO answers (question_id, answer_text) VALUES (?, ?)",
          [id, text],
        );
      }
    }

    return true;
  });

export const deleteQuestion = (id) =>
  run("DELETE FROM questions WHERE id = ?", [id]);

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

export const listAnswers = (questionId) =>
  all("SELECT * FROM answers WHERE question_id = ? ORDER BY id", [questionId]);

export const updateAnswer = (id, answer_text) =>
  run("UPDATE answers SET answer_text = ? WHERE id = ?", [answer_text, id]);

export const deleteAnswer = (id) =>
  run("DELETE FROM answers WHERE id = ?", [id]);
