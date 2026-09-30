/**
 * Full-text search using SQLite's built-in FTS5.
 *
 * Two virtual tables are maintained side by side, each keyed by the rowid of its
 * own base table:
 *
 *   search_questions  rowid -> questions.id   (question text)
 *   search_answers    rowid -> answers.id     (answer text)
 *
 * Answers are indexed individually rather than concatenated per question
 * because a trigger body may not contain a subquery, so an aggregate
 * "recompute this question's answers" trigger is not expressible in SQLite.
 * Indexing per answer keeps every trigger a single-row statement, and the two
 * result sets are merged in the search query instead.
 *
 * Tokenizer notes:
 *  - `unicode61` treats Arabic letters as token characters, so Arabic content is
 *    indexed and matched without a custom tokenizer.
 *  - `remove_diacritics 2` folds Latin accents, so `café` matches `cafe`. It does
 *    NOT fold Arabic tashkeel or tatweel: `الخدمة` and `الـخدمة` stay distinct
 *    tokens (verified against `fts5vocab`). Matching is token-level, with no
 *    stemming, so inflected forms of a root also remain distinct.
 */
const TOKENIZE = "unicode61 remove_diacritics 2";

export async function up(ctx) {
  await ctx.run(
    `CREATE VIRTUAL TABLE IF NOT EXISTS search_questions
       USING fts5(question_text, tokenize = '${TOKENIZE}')`,
  );

  await ctx.run(
    `CREATE VIRTUAL TABLE IF NOT EXISTS search_answers
       USING fts5(answer_text, tokenize = '${TOKENIZE}')`,
  );

  // --- questions ----------------------------------------------------------
  await ctx.run(`
    CREATE TRIGGER IF NOT EXISTS search_questions_ai
    AFTER INSERT ON questions
    BEGIN
      INSERT INTO search_questions (rowid, question_text)
      VALUES (new.id, new.question_text);
    END
  `);

  await ctx.run(`
    CREATE TRIGGER IF NOT EXISTS search_questions_au
    AFTER UPDATE ON questions
    BEGIN
      UPDATE search_questions
         SET question_text = new.question_text
       WHERE rowid = new.id;
    END
  `);

  await ctx.run(`
    CREATE TRIGGER IF NOT EXISTS search_questions_ad
    AFTER DELETE ON questions
    BEGIN
      DELETE FROM search_questions WHERE rowid = old.id;
    END
  `);

  // --- answers ------------------------------------------------------------
  await ctx.run(`
    CREATE TRIGGER IF NOT EXISTS search_answers_ai
    AFTER INSERT ON answers
    BEGIN
      INSERT INTO search_answers (rowid, answer_text)
      VALUES (new.id, new.answer_text);
    END
  `);

  await ctx.run(`
    CREATE TRIGGER IF NOT EXISTS search_answers_au
    AFTER UPDATE ON answers
    BEGIN
      UPDATE search_answers
         SET answer_text = new.answer_text
       WHERE rowid = new.id;
    END
  `);

  await ctx.run(`
    CREATE TRIGGER IF NOT EXISTS search_answers_ad
    AFTER DELETE ON answers
    BEGIN
      DELETE FROM search_answers WHERE rowid = old.id;
    END
  `);

  // Backfill rows that predate the index. On a fresh database the triggers above
  // have already covered every row, so this is normally a no-op.
  await ctx.run(`
    INSERT INTO search_questions (rowid, question_text)
    SELECT q.id, q.question_text
      FROM questions q
     WHERE q.id NOT IN (SELECT rowid FROM search_questions)
  `);

  await ctx.run(`
    INSERT INTO search_answers (rowid, answer_text)
    SELECT a.id, a.answer_text
      FROM answers a
     WHERE a.id NOT IN (SELECT rowid FROM search_answers)
  `);
}
