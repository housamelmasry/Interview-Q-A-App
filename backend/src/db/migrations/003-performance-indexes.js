/**
 * Indexes on the foreign key columns.
 *
 * SQLite does not create indexes for foreign key columns automatically (unlike
 * `INTEGER PRIMARY KEY`, which is the rowid alias). Without these, filtering
 * questions by category and fetching a question's answers both degrade into a
 * full table scan, so the cost grows linearly with the dataset.
 *
 * Before:  "SEARCH questions USING INTEGER PRIMARY KEY (rowid=?)"  /  "SCAN answers"
 * After:   "SEARCH questions USING INDEX idx_questions_category_id (category_id=?)"
 *          "SEARCH answers USING INDEX idx_answers_question_id (question_id=?)"
 */
export async function up(ctx) {
  await ctx.run(
    "CREATE INDEX IF NOT EXISTS idx_questions_category_id ON questions(category_id)",
  );
  await ctx.run(
    "CREATE INDEX IF NOT EXISTS idx_answers_question_id ON answers(question_id)",
  );

  // Supports ordering by recency and the composite filter-and-sort read path.
  await ctx.run(
    "CREATE INDEX IF NOT EXISTS idx_questions_category_created ON questions(category_id, id)",
  );
}
