/**
 * Full-text search over questions and answers, backed by the two FTS5 tables
 * created in migration 004.
 *
 * A question can match either because its own text matched or because one of its
 * answers did. Both result sets are combined, de-duplicated per question, and
 * ordered so that direct question-text matches rank above answer-only matches.
 */

const MAX_TOKENS = 8;

/**
 * Turns raw user input into a safe FTS5 MATCH expression.
 *
 * FTS5 treats several characters as query syntax, so passing a user string
 * straight to MATCH both breaks on punctuation and lets a search term smuggle in
 * operators. Every token is reduced to letters and digits and wrapped in double
 * quotes, which makes it an inert string literal, then joined with AND. The last
 * token gets a prefix `*` so results narrow as the user types.
 *
 * Returns null when the input holds nothing searchable, which callers treat as
 * "no results" rather than an error.
 */
export function buildMatchQuery(raw) {
  const tokens = String(raw ?? "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_TOKENS);

  if (tokens.length === 0) return null;

  return tokens
    .map((token, i) => `"${token}"${i === tokens.length - 1 ? "*" : ""}`)
    .join(" AND ");
}

/**
 * Hits from both indexes, merged per question.
 *
 * `source` is 0 when the question text itself matched and 1 when only an answer
 * did, which is the primary sort key. `rank` is bm25 (lower is better) from
 * whichever index produced the best hit.
 */
const HITS_CTE = `
  WITH question_hits AS (
    SELECT rowid AS id,
           bm25(search_questions) AS rank,
           0 AS source
      FROM search_questions
     WHERE search_questions MATCH ?
  ),
  answer_hits AS (
    SELECT a.question_id AS id,
           bm25(search_answers) AS rank,
           1 AS source
      FROM search_answers s
      JOIN answers a ON a.id = s.rowid
     WHERE search_answers MATCH ?
  ),
  hits AS (
    SELECT id, MIN(rank) AS rank, MIN(source) AS source
      FROM (SELECT * FROM question_hits UNION ALL SELECT * FROM answer_hits)
     GROUP BY id
  )
`;

/**
 * The count and the page are built from the same fragments, with the filter
 * spliced in before `ORDER BY`.
 *
 * These are functions rather than constants because a `WHERE` clause cannot be
 * appended to the end of the page query, which already ends in `ORDER BY`.
 */
const totalSql = (filter) => `${HITS_CTE}
  SELECT COUNT(*) AS count
    FROM hits
    JOIN questions q ON q.id = hits.id
   ${filter}
`;

/** The page of question ids, so LIMIT counts questions rather than answer rows. */
const pageIdsSql = (filter) => `${HITS_CTE}
  SELECT q.id
    FROM hits
    JOIN questions q ON q.id = hits.id
   ${filter}
   ORDER BY hits.source, hits.rank, q.id
   LIMIT ? OFFSET ?
`;

/**
 * The difficulty predicate, or an empty string when there is no filter.
 *
 * Both the count and the page query filter on the same column, so `total` always
 * describes exactly the set the page is drawn from.
 */
const difficultyFilter = (difficulty) =>
  difficulty ? "WHERE q.difficulty = ?" : "";

/**
 * Hydrates a page of question ids with their category metadata and answers.
 * The placeholder list is built from the actual id count rather than padded to a
 * fixed width.
 */
const hydrateSql = (count) => `
  SELECT q.id, q.question_text, q.category_id, q.difficulty, q.tags,
         c.label AS category_label, c.icon, c.color,
         a.id AS answer_id, a.answer_text
    FROM questions q
    JOIN categories c ON c.id = q.category_id
    LEFT JOIN answers a ON a.question_id = q.id
   WHERE q.id IN (${new Array(count).fill("?").join(",")})
   ORDER BY q.id, a.id
`;

/** Collapses the flat join into the nested question shape the client expects. */
export function groupRows(rows) {
  const byId = new Map();

  for (const row of rows) {
    if (!byId.has(row.id)) {
      byId.set(row.id, {
        id: row.id,
        question_text: row.question_text,
        category_id: row.category_id,
        category_label: row.category_label,
        icon: row.icon,
        color: row.color,
        difficulty: row.difficulty,
        tags: safeParseTags(row.tags),
        answers: [],
      });
    }
    if (row.answer_id !== null && row.answer_id !== undefined) {
      byId.get(row.id).answers.push({
        id: row.answer_id,
        answer_text: row.answer_text,
      });
    }
  }

  return Array.from(byId.values());
}

export function safeParseTags(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const wrap = (fn) =>
  new Promise((resolve, reject) => {
    fn((err, rows) => (err ? reject(err) : resolve(rows)));
  });

/**
 * Runs a search.
 *
 * Multi-word queries are matched with AND first. Arabic tokenisation means a
 * leading definite article in a query ("ال") has no matching token in the corpus,
 * which would otherwise make "ال container" return nothing, so an empty AND
 * result is retried with OR before giving up.
 *
 * `difficulty` is an optional exact-match filter on `questions.difficulty`. It is
 * applied to both the count and the page query, and it is not indexed on its own:
 * a difficulty filter is always combined with either a category or a text match,
 * and the planner still reaches the rows through `idx_questions_category_id` or
 * the FTS index. A filter that would scan the whole table would need its own
 * index, which is not warranted at this corpus size.
 */
export async function searchQuestions(
  db,
  term,
  { limit = 10, offset = 0, difficulty = null } = {},
) {
  const match = buildMatchQuery(term);
  if (match === null) return { items: [], total: 0 };

  const all = (sql, params) => wrap((cb) => db.all(sql, params, cb));
  const filter = difficultyFilter(difficulty);
  const count = totalSql(filter);
  const page = pageIdsSql(filter);
  // Bind order has to match the order the placeholders appear in each statement:
  // the two MATCH expressions come first, then the filter, then LIMIT/OFFSET.
  const filterParam = difficulty ? [difficulty] : [];

  let expression = match;
  let countRows = await all(count, [expression, expression, ...filterParam]);

  if (countRows[0].count === 0 && expression.includes(" AND ")) {
    expression = expression.replaceAll(" AND ", " OR ");
    countRows = await all(count, [expression, expression, ...filterParam]);
  }

  const total = countRows[0].count;
  if (total === 0) return { items: [], total: 0 };

  // Paginate on questions, then hydrate them. Applying LIMIT to the joined rows
  // instead would let a question's answer count consume the page budget.
  const idRows = await all(page, [
    expression,
    expression,
    ...filterParam,
    limit,
    offset,
  ]);

  // A page past the end has no ids, but `total` still describes the result set.
  // Reporting 0 here would make the client show "no results" and hide its
  // pagination controls even though matching questions exist.
  if (idRows.length === 0) return { items: [], total };

  const ids = idRows.map((r) => r.id);
  const rows = await all(hydrateSql(ids.length), ids);

  return { items: groupRows(rows), total };
}
